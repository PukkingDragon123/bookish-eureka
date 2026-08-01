#!/usr/bin/env python3
"""Repair extraction defects across the sprite set.

Runs on assets/creatures in place:
  1. strip cell-boundary lines, hollow frame outlines and leftover neighbour slabs
  2. strip flat near-black background patches (sheet 17's dark gutters)
  3. drop far-flung satellite blobs that belong to a neighbouring sprite
  4. split sprites where two creatures were merged into one cutout
  5. delete confirmed garbage fragments
  6. re-trim and re-pad every sprite so its bbox hugs the art
"""
import os, sys, glob
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'assets', 'creatures')

# two creatures fused into one cutout -> emit both
SPLIT = ['s01_07', 's01_09', 's01_10', 's02_04',
         's07_08', 's08_15', 's08_24', 's09_12', 's15_06']

# sprites whose leftover junk survives the generic rules — the creature is the
# single largest blob and everything else in the cutout is neighbouring art,
# cell borders or caption boxes, so keep the main blob and nothing else
MAIN_ONLY = ['s01_08', 's14_13', 's12_01', 's09_02', 's05_13', 's14_44',
             's06_15', 's14_69', 's16_01', 's02_07', 's11_02', 's03_03']

# a handful of cutouts have neighbouring art fused to the creature with no
# seam to detect — erase those regions by hand, as fractions of the sprite box
ERASE = {
    's17_10':  [(0.52, 0.00, 1.00, 1.00)],   # broken neighbour to the right
    's14_79':  [(0.80, 0.00, 1.00, 1.00)],   # slice of the next cell
    's14_105': [(0.00, 0.00, 1.00, 0.10)],   # cell divider along the top
    's07_09':  [(0.62, 0.00, 1.00, 1.00)],   # tan debris from the sprite above
    's14_39':  [(0.60, 0.00, 1.00, 0.55),    # flat blue cell background
                (0.00, 0.00, 1.00, 0.05)],   # cell border along the top
    's14_31':  [(0.94, 0.00, 1.00, 1.00)],   # cell divider on the right
}

# unrecoverable fragments (mostly sheet 10, whose source art is ~40px tall)
DROP = ['s03_02', 's03_12', 's03_10', 's10_00', 's10_03', 's10_07', 's10_10', 's10_20',
        's10_24', 's10_26', 's10_27', 's10_29', 's10_30', 's10_32', 's10_33',
        's10_18', 's10_02']

ST8 = np.ones((3, 3), bool)


def _describe(m):
    ys, xs = np.where(m)
    return dict(mask=m, area=int(m.sum()),
                bbox=(int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def blob_list(alpha):
    lab, n = ndimage.label(alpha, structure=ST8)
    out = [_describe(lab == i) for i in range(1, n + 1)]
    out.sort(key=lambda b: -b['area'])
    return out


def blob_list_split(alpha, erode=2):
    """Like blob_list, but thin pixel bridges do not fuse regions together.

    Cell-border leftovers frequently touch the creature by a single-pixel
    stitch; eroding first separates them, then each core is grown back
    geodesically so the returned masks still cover the full original pixels.
    """
    core = ndimage.binary_erosion(alpha, structure=ST8, iterations=erode)
    lab, n = ndimage.label(core, structure=ST8)
    if n <= 1:
        return blob_list(alpha)
    seeds = [lab == i for i in range(1, n + 1)]
    seeds = [s for s in seeds if s.sum() >= 12]
    if len(seeds) <= 1:
        return blob_list(alpha)
    owner = np.zeros(alpha.shape, np.int32)
    for i, s in enumerate(seeds, 1):
        owner[s] = i
    # simultaneous geodesic growth so each pixel joins its nearest core
    for _ in range(erode + 3):
        for i in range(1, len(seeds) + 1):
            grow = ndimage.binary_dilation(owner == i, structure=ST8) & alpha & (owner == 0)
            owner[grow] = i
    out = [_describe(owner == i) for i in range(1, len(seeds) + 1) if (owner == i).any()]
    leftover = alpha & (owner == 0)
    if leftover.any():
        out.extend(blob_list(leftover))
    out.sort(key=lambda b: -b['area'])
    return out


def bbox_gap(a, b):
    """Manhattan-ish gap between two bboxes (0 if overlapping)."""
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    dx = max(0, max(bx0 - ax1, ax0 - bx1))
    dy = max(0, max(by0 - ay1, ay0 - by1))
    return (dx * dx + dy * dy) ** 0.5


def is_line(b, w, h):
    x0, y0, x1, y1 = b['bbox']
    bw, bh = x1 - x0, y1 - y0
    if bw <= 7 and bh >= 0.22 * h:
        return True
    if bh <= 7 and bw >= 0.22 * w:
        return True
    return False


def is_frame(b, w, h):
    """Hollow rectangle outline left over from a cell border."""
    x0, y0, x1, y1 = b['bbox']
    bw, bh = x1 - x0, y1 - y0
    if bw < 0.5 * w or bh < 0.5 * h:
        return False
    return b['area'] / max(1, bw * bh) < 0.16


def is_slab(b, rgb):
    """Solid, flat-coloured rectangle = a piece of a neighbouring cell."""
    x0, y0, b_x1, b_y1 = b['bbox']
    bw, bh = b_x1 - x0, b_y1 - y0
    if b['area'] < 500:
        return False
    if b['area'] / max(1, bw * bh) < 0.80:
        return False
    px = rgb[b['mask']]
    return float(px.std(axis=0).mean()) < 30.0


def dark_patch_mask(alpha, rgb):
    """Thick near-black regions (sheet-17 gutters) while sparing black outlines.

    Eroding kills thin outlines; whatever core survives is a solid slab of
    background, which we then grow back inside the dark region.
    """
    dark = alpha & (rgb.max(axis=2) < 70)
    if not dark.any():
        return np.zeros_like(dark)
    core = ndimage.binary_erosion(dark, structure=ST8, iterations=3)
    lab, n = ndimage.label(core, structure=ST8)
    if n == 0:
        return np.zeros_like(dark)
    keep = np.zeros_like(core)
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() >= 90:
            keep |= m
    if not keep.any():
        return np.zeros_like(dark)
    # geodesic dilation of the cores back through the dark region
    grown = keep.copy()
    for _ in range(24):
        nxt = ndimage.binary_dilation(grown, structure=ST8) & dark
        if np.array_equal(nxt, grown):
            break
        grown = nxt
    return grown


def isolated_bars(alpha):
    """Long, thin, isolated vertical/horizontal bars = cell-border leftovers."""
    h, w = alpha.shape
    kill = np.zeros_like(alpha)
    colc = alpha.sum(axis=0)
    for x in range(w):
        if colc[x] < 0.22 * h:
            continue
        left = colc[max(0, x - 6):max(0, x - 2)]
        right = colc[min(w, x + 3):min(w, x + 7)]
        lo = left.max() if len(left) else 0
        ro = right.max() if len(right) else 0
        if lo < 0.06 * h and ro < 0.06 * h:
            kill[:, max(0, x - 2):x + 3] = True
    rowc = alpha.sum(axis=1)
    for y in range(h):
        if rowc[y] < 0.22 * w:
            continue
        up = rowc[max(0, y - 6):max(0, y - 2)]
        dn = rowc[min(h, y + 3):min(h, y + 7)]
        uo = up.max() if len(up) else 0
        do = dn.max() if len(dn) else 0
        if uo < 0.06 * w and do < 0.06 * w:
            kill[max(0, y - 2):y + 3, :] = True

    # bars hugging an image border only have empty space on the inward side
    for y in range(min(5, h)):
        if rowc[y] >= 0.30 * w and rowc[min(h - 1, y + 6)] < 0.12 * w:
            kill[:y + 2, :] = True
    for y in range(max(0, h - 5), h):
        if rowc[y] >= 0.30 * w and rowc[max(0, y - 6)] < 0.12 * w:
            kill[y - 1:, :] = True
    for x in range(min(5, w)):
        if colc[x] >= 0.30 * h and colc[min(w - 1, x + 6)] < 0.12 * h:
            kill[:, :x + 2] = True
    for x in range(max(0, w - 5), w):
        if colc[x] >= 0.30 * h and colc[max(0, x - 6)] < 0.12 * h:
            kill[:, x - 1:] = True
    return kill & alpha


def clean(arr):
    """Return a cleaned RGBA array (or None if nothing survives)."""
    a = arr.copy()
    rgb = a[..., :3].astype(int)
    alpha = a[..., 3] > 128
    h, w = alpha.shape
    if not alpha.any():
        return None

    # --- thick near-black background slabs
    a[dark_patch_mask(alpha, rgb), 3] = 0
    alpha = a[..., 3] > 128
    if not alpha.any():
        return None

    # --- straight cell-border bars, even where they touch the body
    a[isolated_bars(alpha), 3] = 0
    alpha = a[..., 3] > 128
    if not alpha.any():
        return None

    # --- structural junk relative to the main blob
    bl = blob_list(alpha)
    if not bl:
        return None
    main = bl[0]
    diag = (w * w + h * h) ** 0.5
    for b in bl[1:]:
        x0, y0, x1, y1 = b['bbox']
        touches_border = x0 <= 1 or y0 <= 1 or x1 >= w - 1 or y1 >= h - 1
        gap = bbox_gap(b['bbox'], main['bbox'])
        kill = False
        bw, bh = x1 - x0, y1 - y0
        rectish = b['area'] / max(1, bw * bh) > 0.68
        if is_line(b, w, h) or is_frame(b, w, h) or is_slab(b, rgb):
            kill = True
        elif b['area'] < 0.28 * main['area'] and gap > 0.06 * diag:
            kill = True
        elif touches_border and gap >= 3 and b['area'] < 0.5 * main['area']:
            kill = True
        elif touches_border and rectish and gap >= 2 and b['area'] < 0.9 * main['area']:
            kill = True
        elif b['area'] < 25:
            kill = True
        if kill:
            a[b['mask'], 3] = 0
    return a


def trim(a, pad=2):
    alpha = a[..., 3] > 0
    if not alpha.any():
        return None
    ys, xs = np.where(alpha)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    sub = a[y0:y1, x0:x1]
    out = np.zeros((sub.shape[0] + pad * 2, sub.shape[1] + pad * 2, 4), sub.dtype)
    out[pad:-pad, pad:-pad] = sub
    return out


def split_two(a):
    """Split a merged cutout into its two largest blobs, left/top first."""
    alpha = a[..., 3] > 128
    bl = blob_list(alpha)
    if len(bl) < 2:
        return None
    big = [b for b in bl if b['area'] > 0.16 * bl[0]['area']][:2]
    if len(big) < 2:
        return None
    big.sort(key=lambda b: (b['bbox'][0], b['bbox'][1]))
    outs = []
    for b in big:
        c = a.copy()
        c[~b['mask'], 3] = 0
        outs.append(trim(c))
    return outs


def main():
    stats = dict(cleaned=0, split=0, dropped=0, unchanged=0)

    for name in DROP:
        p = os.path.join(SRC, name + '.png')
        if os.path.exists(p):
            os.remove(p)
            stats['dropped'] += 1

    for p in sorted(glob.glob(SRC + '/*.png')):
        stem = os.path.basename(p)[:-4]
        arr = np.array(Image.open(p).convert('RGBA'))

        if stem in SPLIT:
            parts = split_two(arr)
            if parts and all(x is not None for x in parts):
                for idx, part in enumerate(parts):
                    part = clean(part)
                    if part is None:
                        continue
                    part = trim(part)
                    out = p if idx == 0 else os.path.join(SRC, stem + 'b.png')
                    Image.fromarray(part).save(out)
                stats['split'] += 1
                continue

        if stem in ERASE:
            hh, ww = arr.shape[:2]
            for (fx0, fy0, fx1, fy1) in ERASE[stem]:
                arr[int(fy0 * hh):int(fy1 * hh), int(fx0 * ww):int(fx1 * ww), 3] = 0

        cleaned = clean(arr)
        if cleaned is not None and stem in MAIN_ONLY:
            bl = blob_list(cleaned[..., 3] > 128)
            if bl:
                keep = bl[0]['mask']
                cleaned[~keep, 3] = 0
        if cleaned is None:
            os.remove(p)
            stats['dropped'] += 1
            continue
        cleaned = trim(cleaned)
        if cleaned is None:
            os.remove(p)
            stats['dropped'] += 1
            continue
        if cleaned.shape != arr.shape or not np.array_equal(cleaned, arr):
            Image.fromarray(cleaned).save(p)
            stats['cleaned'] += 1
        else:
            stats['unchanged'] += 1

    print(stats, 'remaining:', len(glob.glob(SRC + '/*.png')))


if __name__ == '__main__':
    main()
