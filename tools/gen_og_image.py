"""
Generates the static Open Graph / Twitter share image (public/og-image.png,
1200x630) for the site. Not part of the shipped app code - a one-off asset
generator. Requires Pillow (pip install pillow).
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "og-image.png")

BG = (15, 17, 21)
TEXT = (244, 244, 245)
MUTED = (156, 163, 175)
BLUE = (96, 165, 250)
GREEN = (52, 211, 153)
BORDER = (42, 45, 53)

FONTS_DIR = "C:/Windows/Fonts"


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(FONTS_DIR, name), size)


def draw_curve(draw: ImageDraw.ImageDraw, x0: int, y0: int, w: int, h: int) -> None:
    # A simple rising "evaporation curve" motif, echoing the site's chart.
    points = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        # log-ish rising curve, flattening early then climbing
        x = x0 + t * w
        y = y0 + h - (t**1.8) * h
        points.append((x, y))
    draw.line(points, fill=BLUE, width=5, joint="curve")
    draw.ellipse(
        [points[-1][0] - 9, points[-1][1] - 9, points[-1][0] + 9, points[-1][1] + 9],
        fill=GREEN,
    )


def main() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    title_font = load_font("arialbd.ttf", 64)
    subtitle_font = load_font("arial.ttf", 32)
    tag_font = load_font("arial.ttf", 26)

    margin = 72

    draw.text((margin, 90), "Backtest Overfitting", font=title_font, fill=TEXT)
    draw.text((margin, 168), "Calculator", font=title_font, fill=TEXT)

    draw.text(
        (margin, 262),
        "Deflated Sharpe Ratio, explained \u2014 free, in your browser",
        font=subtitle_font,
        fill=MUTED,
    )

    draw.line([(margin, 320), (WIDTH - margin, 320)], fill=BORDER, width=2)

    draw_curve(draw, margin, 360, 520, 170)

    tag_lines = [
        "Your numbers never leave your browser.",
        "No signup. No tracking. Not investment advice.",
    ]
    ty = 380
    for line in tag_lines:
        draw.text((margin + 580, ty), line, font=tag_font, fill=MUTED)
        ty += 40

    img.save(OUTPUT_PATH, "PNG")
    print(f"Wrote {WIDTH}x{HEIGHT} OG image to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
