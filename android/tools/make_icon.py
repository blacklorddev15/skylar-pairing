#!/usr/bin/env python3
"""Derive the app's launcher, splash and in-app brand artwork from the source photo.

Source of truth: branding/icon-source.jpg (736x981 portrait). The square crop below keeps the
whole hairstyle in frame with the face centred — variant "B" from the crop comparison.

Outputs (all under android/app/src/main/res):
  mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png   legacy icons, rounded corners
  drawable-nodpi/ic_launcher_foreground.png                 adaptive-icon foreground, full bleed
  drawable-nodpi/ic_splash_photo.png                        circular mark for the Android 12 splash
  drawable-nodpi/ic_brand_photo.png                         circular mark for the in-app loading view

Requires Pillow (pure-Python otherwise):  python3 -m pip install Pillow
Run:  python3 android/tools/make_icon.py
"""

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, "..", ".."))
SOURCE = os.path.join(PROJECT, "branding", "icon-source.jpg")
RES = os.path.join(HERE, "..", "app", "src", "main", "res")

# square crop window inside the 736x981 source
CROP = (0, 60, 736, 796)

DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
LEGACY_CORNER = 0.22          # corner radius as a fraction of the icon side
ADAPTIVE_SHIFT = 0.025        # nudge the photo down so the head clears a circular launcher mask
SPLASH_CONTENT = 0.62         # splash mark diameter as a fraction of the canvas
SS = 4                        # supersampling for masks


def source_square():
    im = Image.open(SOURCE).convert("RGB")
    return im.crop(CROP)


def rounded_mask(side, radius_frac):
    big = side * SS
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, big - 1, big - 1], radius=int(big * radius_frac), fill=255)
    return mask.resize((side, side), Image.LANCZOS)


def circle_mask(side):
    big = side * SS
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, big - 1, big - 1], fill=255)
    return mask.resize((side, side), Image.LANCZOS)


def write_legacy(square):
    for density, side in DENSITIES.items():
        icon = square.resize((side, side), Image.LANCZOS).convert("RGBA")
        icon.putalpha(rounded_mask(side, LEGACY_CORNER))
        folder = os.path.join(RES, "mipmap-" + density)
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, "ic_launcher.png")
        icon.save(path)
        print("%-46s %3dpx" % (os.path.relpath(path, RES), side))


def _save_big(image, name):
    """Photographic assets go out as lossy WebP: 512px PNGs cost ~1 MB, WebP ~150 KB.
    Android decodes WebP natively and resource names ignore the extension, so no XML changes."""
    folder = os.path.join(RES, "drawable-nodpi")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    image.save(path, "WEBP", quality=90, method=6)
    for stale in (path[:-5] + ".png",):          # drop a leftover PNG of the same resource name
        if os.path.exists(stale):
            os.remove(stale)
            print("     removed stale", os.path.relpath(stale, RES))
    return path


def write_adaptive_foreground(square, side=512):
    """Adaptive icons are masked to ~72/108 of the canvas, so fill it and nudge down slightly."""
    canvas = Image.new("RGBA", (side, side), (7, 9, 14, 255))
    photo = square.resize((side, side), Image.LANCZOS)
    canvas.paste(photo, (0, int(side * ADAPTIVE_SHIFT)))
    path = _save_big(canvas, "ic_launcher_foreground.webp")
    print("%-46s %3dpx" % (os.path.relpath(path, RES), side))


def write_circular(square, name, content_frac, side=512):
    """Circular mark, optionally inset so it sits inside a splash icon's safe circle."""
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    inner = max(1, int(side * content_frac))
    mark = square.resize((inner, inner), Image.LANCZOS).convert("RGBA")
    mark.putalpha(circle_mask(inner))
    offset = (side - inner) // 2
    canvas.paste(mark, (offset, offset), mark)
    path = _save_big(canvas, name)
    print("%-46s %3dpx (content %dpx)" % (os.path.relpath(path, RES), side, inner))


def preview(square, path="/tmp/icon_preview.png"):
    """Contact sheet used to eyeball how the icon behaves under real launcher masks."""
    sides = 256
    tiles = []

    legacy = square.resize((sides, sides), Image.LANCZOS).convert("RGBA")
    legacy.putalpha(rounded_mask(sides, LEGACY_CORNER))
    tiles.append(("legacy", legacy))

    adaptive = Image.new("RGBA", (sides, sides), (7, 9, 14, 255))
    adaptive.paste(square.resize((sides, sides), Image.LANCZOS), (0, int(sides * ADAPTIVE_SHIFT)))

    for label, mask in (("circle mask", circle_mask(sides)),
                        ("squircle", rounded_mask(sides, 0.30))):
        tile = adaptive.copy()
        tile.putalpha(mask)
        tiles.append((label, tile))

    splash = Image.new("RGBA", (sides, sides), (7, 9, 14, 255))
    inner = int(sides * SPLASH_CONTENT)
    mark = square.resize((inner, inner), Image.LANCZOS).convert("RGBA")
    mark.putalpha(circle_mask(inner))
    splash.paste(mark, ((sides - inner) // 2, (sides - inner) // 2), mark)
    tiles.append(("splash", splash))

    pad = 10
    sheet = Image.new("RGB", (len(tiles) * sides + (len(tiles) + 1) * pad, sides + 2 * pad + 18),
                      (6, 8, 13))
    d = ImageDraw.Draw(sheet)
    for i, (label, tile) in enumerate(tiles):
        x = pad + i * (sides + pad)
        sheet.paste(tile, (x, pad), tile)
        d.text((x + 4, pad + sides + 3), label, fill=(140, 200, 220))
    sheet.save(path)
    print("preview ->", path)


def main():
    square = source_square()
    write_legacy(square)
    write_adaptive_foreground(square)
    write_circular(square, "ic_splash_photo.webp", SPLASH_CONTENT)
    write_circular(square, "ic_brand_photo.webp", 1.0)
    preview(square)


if __name__ == "__main__":
    main()
