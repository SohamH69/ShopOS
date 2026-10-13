"""Generate the ShopOS app icons in frontend/public/icons/ with Pillow.

The mark is the shopfront from the logo, drawn for a home screen: a peacock tile, a scalloped
marigold awning, and the white open counter beneath it.

    python scripts/generate_icons.py        (run from frontend/)

Outputs
    icon-192.png, icon-512.png       rounded square, transparent corners  (manifest "any")
    maskable-512.png                 full bleed, mark inside the safe zone (manifest "maskable")
    apple-touch-icon.png             180 x 180, full bleed (iOS rounds the corners itself)
    shortcut-new-order.png           96 x 96, for the "New order" manifest shortcut
    shortcut-pickups.png             96 x 96, for the "Pickups" manifest shortcut
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Colours from src/styles/tokens.css
BRAND = (11, 107, 104, 255)  # --brand         #0b6b68
ACCENT = (245, 165, 36, 255)  # --accent        #f5a524
ACCENT_INK = (61, 39, 0, 255)  # --accent-ink    #3d2700
BRAND_TINT_2 = (198, 229, 225, 255)  # --brand-tint-2  #c6e5e1
WHITE = (255, 255, 255, 255)

SUPERSAMPLE = 4  # draw large, then downscale for smooth edges
CORNER = 9 / 32  # the logo tile's corner radius as a share of its size

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"

# The shopfront in logo units (see src/components/brand/Logo.tsx, viewBox 0 0 32 32).
AWNING = (6.0, 7.0, 26.0, 13.0)  # left, top, right, bottom of the solid band
AWNING_RADIUS = 2.5  # top corners of the band, and each scallop
SCALLOP_CENTRES = (8.5, 13.5, 18.5, 23.5)  # x of each half-moon, hanging from the band's bottom
COUNTER = (9.0, 18.0, 23.0, 25.5)  # the white counter
COUNTER_RADIUS = 2.0
COUNTER_SPLIT = (14.25, 18.0, 17.75, 25.5)  # the gap between its two shutters


def draw_shopfront(canvas: Image.Image, scale: float, offset: float) -> None:
    """Draws the awning and counter; `scale` pixels per logo unit, `offset` pixels from the top left."""
    draw = ImageDraw.Draw(canvas)

    def box(left: float, top: float, right: float, bottom: float) -> tuple[float, float, float, float]:
        return (offset + left * scale, offset + top * scale, offset + right * scale, offset + bottom * scale)

    draw.rounded_rectangle(box(*AWNING), radius=AWNING_RADIUS * scale, fill=ACCENT, corners=(True, True, False, False))
    bottom = AWNING[3]
    for centre in SCALLOP_CENTRES:
        draw.ellipse(box(centre - AWNING_RADIUS, bottom - AWNING_RADIUS, centre + AWNING_RADIUS, bottom + AWNING_RADIUS), fill=ACCENT)
    draw.rounded_rectangle(box(*COUNTER), radius=COUNTER_RADIUS * scale, fill=WHITE)
    draw.rectangle(box(*COUNTER_SPLIT), fill=BRAND_TINT_2)


def tile(size: int, rounded: bool, colour: tuple[int, int, int, int] = BRAND) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    if rounded:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size * CORNER, fill=colour)
    else:
        draw.rectangle((0, 0, size, size), fill=colour)
    return canvas


def render(size: int, *, rounded: bool, mark_share: float = 1.0) -> Image.Image:
    """The logo tile at `size`; `mark_share` < 1 shrinks the shopfront toward the centre (safe zone)."""
    big = size * SUPERSAMPLE
    canvas = tile(big, rounded)
    scale = big * mark_share / 32
    offset = (big - 32 * scale) / 2
    draw_shopfront(canvas, scale, offset)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def render_glyph(size: int, glyph: str) -> Image.Image:
    """A small rounded-square icon: a marigold plus (New order) or a white tick (Pickups)."""
    big = size * SUPERSAMPLE
    if glyph == "plus":
        canvas = tile(big, rounded=True, colour=ACCENT)
        ink = ACCENT_INK
    else:
        canvas = tile(big, rounded=True)
        ink = WHITE
    draw = ImageDraw.Draw(canvas)
    stroke = big * 0.11
    if glyph == "plus":
        arm = big * 0.25
        mid = big / 2
        draw.rounded_rectangle((mid - arm, mid - stroke / 2, mid + arm, mid + stroke / 2), radius=stroke / 2, fill=ink)
        draw.rounded_rectangle((mid - stroke / 2, mid - arm, mid + stroke / 2, mid + arm), radius=stroke / 2, fill=ink)
    else:
        points = [(big * 0.28, big * 0.52), (big * 0.44, big * 0.67), (big * 0.73, big * 0.36)]
        draw.line(points, fill=ink, width=int(stroke), joint="curve")
        cap = stroke / 2
        for x, y in (points[0], points[-1]):
            draw.ellipse((x - cap, y - cap, x + cap, y + cap), fill=ink)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save(image: Image.Image, name: str) -> None:
    path = OUT_DIR / name
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(OUT_DIR.parent.parent)} ({image.width}x{image.height})")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    save(render(192, rounded=True), "icon-192.png")
    save(render(512, rounded=True), "icon-512.png")
    # Maskable: launchers crop to a circle or squircle; the shopfront stays inside the 80% safe zone.
    save(render(512, rounded=False, mark_share=0.86), "maskable-512.png")
    save(render(180, rounded=False, mark_share=0.92), "apple-touch-icon.png")
    save(render_glyph(96, "plus"), "shortcut-new-order.png")
    save(render_glyph(96, "tick"), "shortcut-pickups.png")


if __name__ == "__main__":
    main()
