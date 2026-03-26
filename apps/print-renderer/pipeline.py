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
    Style transfer via OpenRouter image generation model (Gemini Flash Image).
    Sends portrait + style prompt, receives transformed image.
    Falls back to original image if API key is missing or call fails.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("[PORTRAIT] No OPENROUTER_API_KEY — skipping style transfer")
        return image_bytes

    model = config.get("selection_model", "google/gemini-2.5-flash-image")
    prompt = config.get("style_prompt", "Transform this portrait into a monochrome wax sculpture.")

    img = open_image(image_bytes)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode()

    print(f"[PORTRAIT] Style transfer via {model} ({img.size[0]}x{img.size[1]})...")

    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        },
                    ],
                }],
            },
            timeout=180,
        )
        resp.raise_for_status()
        result = resp.json()

        # OpenRouter returns images in message.images[] (separate from content)
        choice = result["choices"][0]["message"]

        # Check message.images array (OpenRouter Gemini image generation format)
        images = choice.get("images", [])
        if isinstance(images, list):
            for img_obj in images:
                if isinstance(img_obj, dict) and img_obj.get("type") == "image_url":
                    img_data = img_obj["image_url"]["url"]
                    if img_data.startswith("data:"):
                        img_data = img_data.split(",", 1)[1]
                    print("[PORTRAIT] Style transfer complete")
                    return base64.b64decode(img_data)

        # Fallback: check content array (some models put images there)
        content = choice.get("content", "")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "image_url":
                    img_data = part["image_url"]["url"]
                    if img_data.startswith("data:"):
                        img_data = img_data.split(",", 1)[1]
                    print("[PORTRAIT] Style transfer complete")
                    return base64.b64decode(img_data)

        print(f"[PORTRAIT] No image in response — using original")
        return image_bytes

    except Exception as e:
        print(f"[PORTRAIT] Style transfer failed: {e} — using original")
        return image_bytes


# ── Face Landmark Detection ──────────────────────────────────────────

def _detect_face_landmarks_solutions(rgb: np.ndarray, w: int, h: int):
    """Legacy mp.solutions API (works on macOS, some Linux builds)."""
    with mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    ) as mesh:
        results = mesh.process(rgb)

    if not results.multi_face_landmarks:
        return None
    return results.multi_face_landmarks[0].landmark


def _detect_face_landmarks_tasks(rgb: np.ndarray, w: int, h: int):
    """New mp.tasks API (works everywhere mediapipe is installed)."""
    import tempfile
    import urllib.request

    BaseOptions = mp.tasks.BaseOptions
    FaceLandmarker = mp.tasks.vision.FaceLandmarker
    FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    # Download model if not cached
    model_path = os.path.join(tempfile.gettempdir(), "face_landmarker_v2_with_blendshapes.task")
    if not os.path.exists(model_path):
        print("[PORTRAIT] Downloading face_landmarker model...")
        urllib.request.urlretrieve(
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            model_path,
        )

    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=0.5,
    )

    with FaceLandmarker.create_from_options(options) as landmarker:
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)

    if not result.face_landmarks:
        return None

    # Convert Tasks API landmarks to same format as solutions API
    class LandmarkProxy:
        def __init__(self, lm_list, w, h):
            self._lm = lm_list
            self._w = w
            self._h = h
        def __getitem__(self, idx):
            lm = self._lm[idx]
            class P:
                x = lm.x
                y = lm.y
            return P()

    return LandmarkProxy(result.face_landmarks[0], w, h)


def detect_face_landmarks(image: Image.Image) -> dict:
    """
    Detect face landmarks using mediapipe (468 precise landmarks).
    Tries mp.solutions first, falls back to mp.tasks API.
    Returns dict with pixel coordinates or None if no face detected.
    """
    w, h = image.size
    rgb = np.array(image.convert("RGB"))

    # Try solutions API first, fall back to tasks API
    lm = None
    try:
        lm = _detect_face_landmarks_solutions(rgb, w, h)
    except Exception as e:
        print(f"[PORTRAIT] mp.solutions failed: {e}, trying tasks API")
        try:
            lm = _detect_face_landmarks_tasks(rgb, w, h)
        except Exception as e2:
            print(f"[PORTRAIT] mp.tasks also failed: {e2}")

    if lm is None:
        print("[PORTRAIT] No face detected by mediapipe")
        return None

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

def compute_zoom_crops(image: Image.Image, landmarks: dict, config: dict) -> list[dict]:
    """
    Compute 4 zoom crop regions using the shared-height model.

    All zooms share the same height (forehead - pad_top to chin + pad_bottom).
    Each zoom only varies its width (height * widthRatio) and horizontal offset.
    This matches the portrait-tuner.html crop model exactly.
    """
    w, h = image.size
    forehead_y = landmarks["forehead_top"][1]
    chin_y = landmarks["chin"][1]
    face_h = chin_y - forehead_y

    # Global params — shared across all zooms
    pad_top = config.get("z0_pad_top", 0.3)
    pad_bottom = config.get("z0_pad_bottom", 0.8)

    # Shared height
    top = max(0, round(forehead_y - face_h * pad_top))
    bottom = min(h, round(chin_y + face_h * pad_bottom))
    crop_h = bottom - top

    # Center X from landmarks (midpoint between eyes, as fraction of image width)
    center_x_frac = landmarks["face_center_x"] / w

    # Per-zoom width ratios (accept both naming conventions from config)
    width_ratios = [
        config.get("zoom_0_width", config.get("z0_aspect", 0.67)),
        config.get("zoom_1_width", 0.50),
        config.get("zoom_2_width", 0.30),
        config.get("zoom_3_width", config.get("z3_strip_width", 0.15)),
    ]
    offsets = [
        config.get("zoom_0_offset", 0),
        config.get("zoom_1_offset", 0),
        config.get("zoom_2_offset", 0),
        config.get("zoom_3_offset", 0),
    ]

    zooms = []
    for i, (wr, off) in enumerate(zip(width_ratios, offsets)):
        crop_w = round(crop_h * wr)
        cx = round((center_x_frac + off) * w)
        left = max(0, min(cx - crop_w // 2, w - crop_w))
        right = min(w, left + crop_w)
        zooms.append({
            "name": f"zoom_{i}",
            "box": (left, top, right, bottom),
        })

    return zooms


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
    zoom_index: int | None = None,
) -> list[tuple[str, Image.Image]]:
    """
    Full pipeline: face detection → zoom crops → dither.
    Returns list of (zoom_name, dithered_1bit_image) tuples.
    """
    image = open_image(image_bytes)

    landmarks = detect_face_landmarks(image)
    if not landmarks:
        # No face — shared-height fallback using full image height
        w, h = image.size
        center_x = w // 2
        width_ratios = [0.67, 0.50, 0.30, 0.15]
        zooms = []
        for i, wr in enumerate(width_ratios):
            crop_w = round(h * wr)
            left = max(0, center_x - crop_w // 2)
            right = min(w, left + crop_w)
            zooms.append({"name": f"zoom_{i}", "box": (left, 0, right, h)})
    else:
        zooms = compute_zoom_crops(image, landmarks, config)

    if zoom_index is not None:
        zooms = [z for z in zooms if z["name"] == f"zoom_{zoom_index}"]

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
