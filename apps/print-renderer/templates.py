"""
Print templates — renders structured data as images for thermal printing.

Adapted from pos-server/templates.py. Only the image-rendering functions
are included here (no ESC/POS Formatter dependency).
"""

from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from helpers import resolve_font_path, wrap_text, FONT_THIN, FONT_BOLD


def render_dictionary_image(data: dict, config: dict = None, style: str = "dictionary") -> Image.Image:
    """
    Render a dictionary entry as a black-on-white image.

    Layout settings come from config[style] (defaults to config["dictionary"]).
    The `style` param allows switching between template configs:
    "dictionary", "helvetica", "acidic", etc.

    data = {
        "word": "Ephemeral",
        "definition": "Lasting for a very short time.",
        "citations": ["..."],
    }

    Returns a PIL Image ready for the thermal printer.
    """
    cfg = (config or {}).get(style, {})

    paper_px = cfg.get("paper_px", 576)
    margin = cfg.get("margin", 20)
    line_spacing = cfg.get("line_spacing", 1.4)
    gap_after_word = cfg.get("gap_after_word", 30)
    gap_before_cite = cfg.get("gap_before_cite", 20)

    sz_word = cfg.get("size_word", 32)
    sz_body = cfg.get("size_body", 20)
    sz_cite = cfg.get("size_cite", 18)
    sz_date = cfg.get("size_date", 16)

    usable = paper_px - margin * 2

    # Load fonts from config paths (fall back to bundled Burra)
    word_font = ImageFont.truetype(resolve_font_path(cfg.get("font_word", FONT_BOLD)), sz_word)
    body_font = ImageFont.truetype(resolve_font_path(cfg.get("font_body", FONT_THIN)), sz_body)
    cite_font = ImageFont.truetype(resolve_font_path(cfg.get("font_cite", FONT_THIN)), sz_cite)
    date_font = ImageFont.truetype(resolve_font_path(cfg.get("font_date", FONT_THIN)), sz_date)

    # --- Pre-calculate wrapped text ---
    scratch = ImageDraw.Draw(Image.new("1", (1, 1)))

    # Check for hard-wrap mode (e.g., Acidic template)
    hard_wrap = cfg.get("hard_wrap", False)

    def do_wrap(text, font, max_w):
        if hard_wrap:
            return _hard_wrap(text, font, max_w, scratch)
        return wrap_text(text, font, max_w, scratch)

    # Prepare all text blocks
    word_lines = [data["word"]]
    def_lines = do_wrap(data["definition"], body_font, usable)

    cite_blocks = []
    for cite in data.get("citations", []):
        wrapped = do_wrap(f"- {cite}", cite_font, usable - 10)
        for i in range(1, len(wrapped)):
            wrapped[i] = f"  {wrapped[i]}"
        cite_blocks.append(wrapped)

    now = datetime.now().strftime("%Y-%m-%d  %H:%M")

    # --- Calculate total height ---
    y = margin
    word_h = int(sz_word * line_spacing) * len(word_lines)
    def_h = int(sz_body * line_spacing) * len(def_lines)
    cite_gap = gap_before_cite if cite_blocks else 0
    cite_h = 0
    for block in cite_blocks:
        cite_h += int(sz_cite * line_spacing) * len(block) + 6
    sep_gap = 16
    date_h = 24

    total_h = (y + word_h + gap_after_word + def_h + cite_gap + cite_h
               + sep_gap + date_h + margin)

    # --- Draw ---
    img = Image.new("1", (paper_px, total_h), 1)
    draw = ImageDraw.Draw(img)

    # Word (bold)
    for line in word_lines:
        draw.text((margin, y), line, font=word_font, fill=0)
        y += int(sz_word * line_spacing)

    y += gap_after_word

    # Definition (thin)
    for line in def_lines:
        draw.text((margin, y), line, font=body_font, fill=0)
        y += int(sz_body * line_spacing)

    # Citations
    if cite_blocks:
        y += cite_gap
        for block in cite_blocks:
            for line in block:
                draw.text((margin + 10, y), line, font=cite_font, fill=0)
                y += int(sz_cite * line_spacing)
            y += 6

    # Dotted separator
    y += sep_gap
    dot_w = scratch.textbbox((0, 0), ". ", font=date_font)[2] or 8
    dots = ". " * (usable // dot_w)
    draw.text((margin, y), dots.strip(), font=date_font, fill=0)
    y += 20

    # Date
    draw.text((margin, y), now, font=date_font, fill=0)

    return img


def _hard_wrap(text: str, font, max_w: int, draw) -> list[str]:
    """Wrap text by character count — cuts mid-word when the line is full."""
    lines = []
    current = ""
    for ch in text:
        test = current + ch
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] > max_w and current:
            lines.append(current)
            current = ch
        else:
            current = test
    if current:
        lines.append(current)
    return lines or [""]
