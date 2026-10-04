"""Generate the ShopOS app icons in frontend/public/icons/ with Pillow.

The mark is the order slip from the logo, drawn for a home screen: a white paper slip with a
torn zig-zag bottom edge, two ballpoint-blue ink lines and a small violet stamp dot, on a
pen-blue square.

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
PEN = (43, 69, 181, 255)  # --pen     #2b45b5
PAPER = (255, 255, 255, 255)  # --paper   #ffffff
STAMP = (110, 63, 176, 255)  # --stamp   #6e3fb0

SUPERSAMPLE = 4  # draw large, then downscale for smooth edges
CORNER = 0.225  # rounded-square corner radius as a share of the icon size

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"

# The slip in logo units (see src/components/brand/Logo.tsx): 16 wide, 25 tall including the
# torn edge, top corners rounded 3.5, four notches 4 wide and 1.6 deep along the bottom.
SLIP_W = 16.0
SLIP_H = 25.0
SLIP_RADIUS = 3.5
NOTCH_W = 4.0
NOTCH_DEPTH = 1.6
INK_LINES = ((3.5, 5.6, 9.0, 2.1), (3.5, 10.2, 5.6, 2.1))  # x, y, width, height
STAMP_DOT = (11.8, 17.4, 2.7)  # centre x, centre y, radius


def draw_slip(canvas: Image.Image, slip_height: float) -> None:
    """Draws the slip, centred, `slip_height` pixels tall (torn edge included)."""
    size = canvas.width
    unit = slip_height / SLIP_H
    width = SLIP_W * unit
    left = (size - width) / 2
    # The notches make the bottom look lighter, so sit the slip a touch above true centre.
    top = (size - slip_height) / 2 - unit * 0.3
    bottom = top + slip_height

    mask = Image.new("L", canvas.size, 0)
    shape = ImageDraw.Draw(mask)
    shape.rounded_rectangle(
        (left, top, left + width, bottom),
        radius=SLIP_RADIUS * unit,
        fill=255,
        corners=(True, True, False, False),
    )
    notches = int(round(SLIP_W / NOTCH_W))
    for index in range(notches):
        x0 = left + index * NOTCH_W * unit
        shape.polygon(
            [(x0, bottom + 1), (x0 + NOTCH_W * unit / 2, bottom - NOTCH_DEPTH * unit), (x0 + NOTCH_W * unit, bottom + 1)],
            fill=0,
        )
    canvas.paste(Image.new("RGBA", canvas.size, PAPER), (0, 0), mask)

    ink = ImageDraw.Draw(canvas)
    for x, y, line_w, line_h in INK_LINES:
        ink.rounded_rectangle(
            (left + x * unit, top + y * unit, left + (x + line_w) * unit, top + (y + line_h) * unit),
            radius=line_h * unit / 2,
            fill=PEN,
        )
    cx, cy, radius = STAMP_DOT
    ink.ellipse(
        (left + (cx - radius) * unit, top + (cy - radius) * unit, left + (cx + radius) * unit, top + (cy + radius) * unit),
        fill=STAMP,
    )


def background(size: int, rounded: bool) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    if rounded:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size * CORNER, fill=PEN)
    else:
        draw.rectangle((0, 0, size, size), fill=PEN)
    return canvas


def render(size: int, *, rounded: bool, slip_share: float) -> Image.Image:
    big = size * SUPERSAMPLE
    canvas = background(big, rounded)
    draw_slip(canvas, big * slip_share)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def render_glyph(size: int, glyph: str) -> Image.Image:
    """A small rounded-square icon with a white plus (New order) or tick (Pickups)."""
    big = size * SUPERSAMPLE
    canvas = background(big, rounded=True)
    draw = ImageDraw.Draw(canvas)
    stroke = big * 0.11
    if glyph == "plus":
        arm = big * 0.25
        mid = big / 2
        draw.rounded_rectangle((mid - arm, mid - stroke / 2, mid + arm, mid + stroke / 2), radius=stroke / 2, fill=PAPER)
        draw.rounded_rectangle((mid - stroke / 2, mid - arm, mid + stroke / 2, mid + arm), radius=stroke / 2, fill=PAPER)
    else:
        points = [(big * 0.28, big * 0.52), (big * 0.44, big * 0.67), (big * 0.73, big * 0.36)]
        draw.line(points, fill=PAPER, width=int(stroke), joint="curve")
        cap = stroke / 2
        for x, y in (points[0], points[-1]):
            draw.ellipse((x - cap, y - cap, x + cap, y + cap), fill=PAPER)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save(image: Image.Image, name: str) -> None:
    path = OUT_DIR / name
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(OUT_DIR.parent.parent)} ({image.width}x{image.height})")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    save(render(192, rounded=True, slip_share=0.6), "icon-192.png")
    save(render(512, rounded=True, slip_share=0.6), "icon-512.png")
    # Maskable: launchers crop to a circle or squircle; the slip stays inside the 80% safe zone.
    save(render(512, rounded=False, slip_share=0.52), "maskable-512.png")
    save(render(180, rounded=False, slip_share=0.56), "apple-touch-icon.png")
    save(render_glyph(96, "plus"), "shortcut-new-order.png")
    save(render_glyph(96, "tick"), "shortcut-pickups.png")


if __name__ == "__main__":
    main()
