#!/usr/bin/env python3
"""Normalize every creature sprite to one consistent pixel density.

The source compilations mix ~40px pixel art with ~300px smooth art. This pass
makes them read as one game:

  1. downscale each sprite to a small native resolution
     (commons ~64px max-dim, showpiece sprites ~96px)
  2. quantize to a tight palette and hard-threshold the alpha
  3. strip fringe pixels (isolated alpha specks left by old halos)
  4. draw a uniform 1px dark outline around the silhouette

Output overwrites assets/creatures in place. The browser upscales at integer
factors with image-rendering: pixelated, so everything lands with the same
chunky pixel look. Files also shrink ~10x.
"""
import glob, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'creatures')

TARGET = 64          # native max-dim for regular sprites
TARGET_BIG = 96      # for large/showpiece art
PALETTE = 24         # colours per sprite
ST8 = np.ones((3, 3), bool)


def is_big(name, w, h):
    if name.startswith('s07_'):          # the big-beast sheet
        return True
    return max(w, h) >= 300              # oversized source art


def pixelate(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    name = os.path.basename(path)
    target = TARGET_BIG if is_big(name, w, h) else TARGET

    # --- 1. downscale to native pixel resolution (only ever shrink)
    m = max(w, h)
    if m > target:
        k = target / m
        nw, nh = max(8, round(w * k)), max(8, round(h * k))
        im = im.resize((nw, nh), Image.LANCZOS)

    a = np.array(im).astype(np.int16)
    alpha = a[..., 3] > 110

    # --- 2. fringe cleanup: drop weak specks, then despeckle
    lab, n = ndimage.label(alpha, structure=ST8)
    if n:
        sizes = ndimage.sum_labels(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        main = sizes.max()
        bad = np.where(sizes < max(3, main * 0.004))[0] + 1
        if len(bad):
            alpha &= ~np.isin(lab, bad)
    if not alpha.any():
        return None

    # --- 3. quantize colours on the opaque pixels only
    rgb = a[..., :3].clip(0, 255).astype(np.uint8)
    flat = Image.fromarray(rgb)
    q = flat.quantize(colors=PALETTE, method=Image.MEDIANCUT, dither=Image.NONE)
    rgb = np.array(q.convert('RGB'))

    # --- 4. uniform outline: darken silhouette-adjacent transparent pixels
    grown = ndimage.binary_dilation(alpha, structure=ST8, iterations=1)
    ring = grown & ~alpha
    out = np.zeros((rgb.shape[0], rgb.shape[1], 4), np.uint8)
    out[..., :3] = rgb
    out[..., 3] = np.where(alpha, 255, 0)
    # outline colour: near-black with a hint of the sprite's darkest tone
    px = rgb[alpha]
    dark = px[px.sum(axis=1).argmin()] // 3
    out[ring, 0] = dark[0]
    out[ring, 1] = dark[1]
    out[ring, 2] = dark[2]
    out[ring, 3] = 255

    # --- 5. trim + 1px pad
    keep = out[..., 3] > 0
    ys, xs = np.where(keep)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    sub = out[y0:y1, x0:x1]
    padded = np.zeros((sub.shape[0] + 2, sub.shape[1] + 2, 4), np.uint8)
    padded[1:-1, 1:-1] = sub
    return padded


def main():
    total_before = total_after = 0
    n = 0
    for p in sorted(glob.glob(SRC + '/*.png')):
        total_before += os.path.getsize(p)
        result = pixelate(p)
        if result is None:
            os.remove(p)
            print('dropped empty:', os.path.basename(p))
            continue
        Image.fromarray(result).save(p, optimize=True)
        total_after += os.path.getsize(p)
        n += 1
    print(f'{n} sprites: {total_before/1e6:.2f}MB -> {total_after/1e6:.2f}MB')


if __name__ == '__main__':
    main()
