#!/usr/bin/env python3
"""Build the app icon set from the starter beast on a branded ground.

A home-screen icon has to be square and fully opaque — iOS composites a
transparent PNG onto black and it reads as a bug. So the beast is centred on
the app's indigo with a soft radial lift behind it, at the three sizes that
actually get used: 180 (apple-touch-icon), 192 and 512 (manifest).
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ui')
BEAST = os.path.join(ROOT, 'assets', 'creatures', 's17_02.png')

BG0 = (16, 21, 41)          # --bg0
LIFT = (58, 74, 132)
SIZES = [180, 192, 512]


def build(size):
    img = Image.new('RGB', (size, size), BG0)
    # radial lift so the mark has depth instead of sitting on a flat square
    yy, xx = np.mgrid[0:size, 0:size]
    cx = cy = (size - 1) / 2
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (size * 0.62)
    t = np.clip(1 - d, 0, 1) ** 1.7
    base = np.asarray(img).astype(np.float64)
    for i in range(3):
        base[..., i] = base[..., i] * (1 - t) + LIFT[i] * t
    img = Image.fromarray(base.astype(np.uint8), 'RGB')

    glow = img.filter(ImageFilter.GaussianBlur(size / 26))
    img = Image.blend(img, glow, 0.35)

    beast = Image.open(BEAST).convert('RGBA')
    k = (size * 0.66) / max(beast.size)
    beast = beast.resize((max(1, round(beast.width * k)),
                          max(1, round(beast.height * k))), Image.LANCZOS)
    # drop shadow, so the sprite is not floating
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    a = beast.split()[3].point(lambda v: int(v * 0.5))
    solid = Image.new('RGBA', beast.size, (0, 0, 0, 255))
    solid.putalpha(a)
    sh.paste(solid, ((size - beast.width) // 2, (size - beast.height) // 2 + round(size * 0.03)))
    sh = sh.filter(ImageFilter.GaussianBlur(size / 40))
    img = Image.alpha_composite(img.convert('RGBA'), sh)
    img.paste(beast, ((size - beast.width) // 2, (size - beast.height) // 2), beast)
    return img.convert('RGB')


def main():
    for s in SIZES:
        p = os.path.join(OUT, f'app-{s}.png')
        build(s).save(p, optimize=True)
        print(f'app-{s}.png  {os.path.getsize(p)/1000:.1f}KB')


if __name__ == '__main__':
    main()
