"""
Portrait-to-Statue pipeline — face detection, zoom crops, dithering.

Adapted from pos-server/portrait_pipeline.py.
Removed: OpenCV fallback, local printing.
Requires: mediapipe (x86 only — that's the whole point of running this in the cloud).
"""

import base64
import io
import os
import numpy as np
import requests
from PIL import Image

import mediapipe as mp

from helpers import open_image
from dithering import _prepare, _apply_blur, dither_image


# ── Stage A: Photo Selection ────────────────────────────────────────

def select_best_photo(image_paths: list[str], config: dict) -> str:
    """
    Send all photos to an OpenRouter vision model and ask it to pick
    the best portrait based on focus, framing, expression, lighting.
    """
    api_key = os.environ.get(config.get("openrouter_api_key_env", "OPENROUTER_API_KEY"), "")
    model = config.get("selection_model", "google/gemini-2.0-flash-001")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set.")

    content = []
    for i, path in enumerate(image_paths):
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        ext = os.path.splitext(path)[1].lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "webp": "image/webp"}.get(ext.lstrip("."), "image/jpeg")
        content.append({"type": "text", "text": f"Photo {i + 1}:"})
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})

    content.append({
        "type": "text",
        "text": (
            f"You are evaluating {len(image_paths)} portrait photos. "
            "Pick the single best photo for an art portrait print. "
            "Criteria: sharp focus on the face, centered framing, natural expression, "
            "clean background, good lighting. "
            "Reply with ONLY the photo number (e.g. '2'). Nothing else."
        )
    })

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": 10,
        },
        timeout=60,
    )
    resp.raise_for_status()

    answer = resp.json()["choices"][0]["message"]["content"].strip()
    num = int("".join(c for c in answer if c.isdigit()) or "1")
    idx = max(0, min(num - 1, len(image_paths) - 1))

    print(f"[PORTRAIT] AI selected photo {idx + 1}/{len(image_paths)}: {image_paths[idx]}")
    return image_paths[idx]


# ── Stage B: Style Transfer via n8n ────────────────────────────────

def transform_to_statue_bytes(image_bytes: bytes, config: dict) -> bytes:
    """
    Style transfer via n8n webhook. Accepts raw image bytes, returns
    transformed image bytes.
    """
    webhook_url = config.get("n8n_webhook_url")
    api_key = os.environ.get(config.get("openrouter_api_key_env", "OPENROUTER_API_KEY"), "")
    prompt = config.get("style_prompt", "Transform this portrait into a monochrome sculpture.")

    if not webhook_url:
        raise RuntimeError("n8n_webhook_url not set in config")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    img = open_image(image_bytes)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    print(f"[PORTRAIT] Sending to n8n ({img.size[0]}x{img.size[1]})...")

    resp = requests.post(
        webhook_url,
        json={"image": b64, "prompt": prompt},
        headers={
            "Content-Type": "application/json",
            "X-OpenRouter-Key": api_key,
        },
        timeout=180,
    )
    resp.raise_for_status()

    if not resp.text:
        raise RuntimeError("n8n webhook returned empty response")

    result = resp.json()

    if "error" in result:
        raise RuntimeError(f"n8n error: {result['error']}")

    if "image" not in result:
        raise RuntimeError(f"n8n webhook returned no image. Keys: {list(result.keys())}")

    print("[PORTRAIT] Transform complete")
    return base64.b64decode(result["image"])


# ── Face Landmark Detection ──────────────────────────────────────────

def detect_face_landmarks(image: Image.Image) -> dict:
    """
    Detect face landmarks using mediapipe face mesh (468 precise landmarks).
    Returns dict with pixel coordinates or None if no face detected.
    """
    w, h = image.size
    rgb = np.array(image.convert("RGB"))

    with mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    ) as mesh:
        results = mesh.process(rgb)

    if not results.multi_face_landmarks:
        print("[PORTRAIT] No face detected by mediapipe")
        return None

    lm = results.multi_face_landmarks[0].landmark

    def px(idx):
        return int(lm[idx].x * w), int(lm[idx].y * h)

    forehead_top = px(10)
    chin = px(152)
    nose_tip = px(4)
    left_eye_outer = px(33)
    left_eye_inner = px(133)
    right_eye_inner = px(362)
    right_eye_outer = px(263)

    left_eye_center = (
        (left_eye_outer[0] + left_eye_inner[0]) // 2,
        (left_eye_outer[1] + left_eye_inner[1]) // 2,
    )
    right_eye_center = (
        (right_eye_outer[0] + right_eye_inner[0]) // 2,
        (right_eye_outer[1] + right_eye_inner[1]) // 2,
    )
    face_center_x = (left_eye_center[0] + right_eye_center[0]) // 2

    landmarks = {
        "forehead_top": forehead_top,
        "chin": chin,
        "nose_tip": nose_tip,
        "left_eye_outer": left_eye_outer,
        "left_eye_inner": left_eye_inner,
        "right_eye_inner": right_eye_inner,
        "right_eye_outer": right_eye_outer,
        "left_eye_center": left_eye_center,
        "right_eye_center": right_eye_center,
        "face_center_x": face_center_x,
    }

    print(f"[PORTRAIT] MediaPipe face detected — eyes at y={left_eye_center[1]}, chin at y={chin[1]}")
    return landmarks


# ── Zoom Crop Geometry ───────────────────────────────────────────────

def compute_zoom_crops(image: Image.Image, landmarks: dict) -> list[dict]:
    """
    Compute 4 zoom crop regions from face landmarks.

    zoom_0: shoulders to hairline — full portrait
    zoom_1: chin to forehead, outer-eye-to-outer-eye width
    zoom_2: eye-center to eye-center width, nose-bridge height
    zoom_3: narrow vertical strip through face center
    """
    w, h = image.size
    face_cx = landmarks["face_center_x"]
    forehead_y = landmarks["forehead_top"][1]
    chin_y = landmarks["chin"][1]
    face_h = chin_y - forehead_y

    left_eye_out_x = landmarks["left_eye_outer"][0]
    right_eye_out_x = landmarks["right_eye_outer"][0]
    left_eye_cx = landmarks["left_eye_center"][0]
    right_eye_cx = landmarks["right_eye_center"][0]
    eye_y = (landmarks["left_eye_center"][1] + landmarks["right_eye_center"][1]) // 2
    nose_y = landmarks["nose_tip"][1]

    def clamp_box(left, top, right, bottom):
        left = max(0, left)
        top = max(0, top)
        right = min(w, right)
        bottom = min(h, bottom)
        return (left, top, right, bottom)

    # zoom_0: shoulders to hairline
    pad_top = int(face_h * 0.3)
    pad_bottom = int(face_h * 0.8)
    z0_top = forehead_y - pad_top
    z0_bottom = chin_y + pad_bottom
    z0_h = z0_bottom - z0_top
    z0_w = int(z0_h * 0.67)
    z0_left = face_cx - z0_w // 2
    zoom_0 = clamp_box(z0_left, z0_top, z0_left + z0_w, z0_bottom)

    # zoom_1: chin to forehead, outer-eye width + padding
    eye_span = right_eye_out_x - left_eye_out_x
    pad_x = int(eye_span * 0.35)
    pad_top1 = int(face_h * 0.15)
    pad_bottom1 = int(face_h * 0.15)
    z1_left = left_eye_out_x - pad_x
    z1_right = right_eye_out_x + pad_x
    z1_top = forehead_y - pad_top1
    z1_bottom = chin_y + pad_bottom1
    zoom_1 = clamp_box(z1_left, z1_top, z1_right, z1_bottom)

    # zoom_2: mid-eye to mid-eye width, centered on nose bridge
    ipd = right_eye_cx - left_eye_cx
    pad_x2 = int(ipd * 0.15)
    z2_left = left_eye_cx - pad_x2
    z2_right = right_eye_cx + pad_x2
    z2_w = z2_right - z2_left
    z2_center_y = (eye_y + nose_y) // 2
    z2_h = int(z2_w * 1.4)
    z2_top = z2_center_y - z2_h // 2
    zoom_2 = clamp_box(z2_left, z2_top, z2_right, z2_top + z2_h)

    # zoom_3: narrow strip through face center (nose width)
    nose_x = landmarks["nose_tip"][0]
    inner_eye_span = landmarks["right_eye_inner"][0] - landmarks["left_eye_inner"][0]
    strip_w = int(inner_eye_span * 0.55)
    z3_left = nose_x - strip_w // 2
    z3_top = forehead_y - int(face_h * 0.05)
    z3_bottom = chin_y + int(face_h * 0.1)
    zoom_3 = clamp_box(z3_left, z3_top, z3_left + strip_w, z3_bottom)

    return [
        {"name": "zoom_0", "box": zoom_0},
        {"name": "zoom_1", "box": zoom_1},
        {"name": "zoom_2", "box": zoom_2},
        {"name": "zoom_3", "box": zoom_3},
    ]


# ── Fallback Crops (no face detected) ───────────────────────────────

def _fallback_box(image: Image.Image, ratio: float) -> tuple:
    """Center crop fallback when no face detected."""
    w, h = image.size
    nw, nh = int(w * ratio), int(h * ratio)
    left = (w - nw) // 2
    top = (h - nh) // 2
    return (left, top, left + nw, top + nh)


def _fallback_strip(image: Image.Image) -> tuple:
    """Narrow strip fallback."""
    w, h = image.size
    nw = int(w * 0.12)
    left = (w - nw) // 2
    return (left, 0, left + nw, h)


# ── Full Processing Pipeline ────────────────────────────────────────

def process_portrait(
    image_bytes: bytes,
    config: dict,
) -> list[tuple[str, Image.Image]]:
    """
    Full pipeline: face detection → zoom crops → dither.
    Returns list of (zoom_name, dithered_1bit_image) tuples.
    """
    image = open_image(image_bytes)

    landmarks = detect_face_landmarks(image)
    if not landmarks:
        zooms = [
            {"name": "zoom_0", "box": (0, 0, image.size[0], image.size[1])},
            {"name": "zoom_1", "box": _fallback_box(image, 0.7)},
            {"name": "zoom_2", "box": _fallback_box(image, 0.4)},
            {"name": "zoom_3", "box": _fallback_strip(image)},
        ]
    else:
        zooms = compute_zoom_crops(image, landmarks)

    paper_px = config.get("paper_px", 576)
    contrast = config.get("contrast", 1.3)
    brightness = config.get("brightness", 1.0)
    sharpness = config.get("sharpness", 1.2)
    blur = config.get("blur", 10)
    dither_mode = config.get("dither_mode", "bayer")

    results = []
    for zoom in zooms:
        cropped = image.crop(zoom["box"])
        grey = _prepare(cropped, paper_px, contrast, brightness, sharpness)
        grey = _apply_blur(grey, blur)
        dithered = dither_image(grey, dither_mode)
        results.append((zoom["name"], dithered))

    return results
