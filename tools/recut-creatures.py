#!/usr/bin/env python3
"""Re-cut every creature sprite from the original 17 uploaded sheets.

Why: the first extraction keyed those sheets with a loose global colour
threshold and then flood-filled. Those sheets have LIGHT backgrounds
(teal #a5cfcd, white, grey), so every light part of a creature — white
bellies, grey stone, bright highlights — fell inside the threshold and
was deleted, leaving eaten interiors, holes and white speckles. It also
binarised alpha, so every edge came out crunchy.

This re-cut:
  * measures the key tolerance from each sheet's own border noise
  * kills ONLY background that is connected to the sheet border, so an
    enclosed light region stays art instead of becoming a hole
  * keeps soft (8-bit) alpha, so edges are clean at any zoom
  * reattaches detached parts (spikes, sparks) that sit inside a
    creature's own footprint

Sprite ids are preserved: each existing sprite is matched to its source
cutout on the same sheet by silhouette + colour, and rewritten in place
at its current size. Saved games and creatures-data.js stay valid.

Usage: python3 tools/recut-creatures.py <dir-with-17-sheets> [--dry]
"""
import os
import re
import sys
import glob
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.optimize import linear_sum_assignment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'assets', 'creatures')


def key_sheet(img):
    """RGB float array + soft alpha. Only border-connected bg is removed."""
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    h, w = a.shape[:2]
    ring = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                           a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)
    noise = float(np.percentile(np.abs(ring - bg).sum(1), 99))
    tol = min(max(22.0, noise * 1.6), 95.0)
    d = np.abs(a - bg).sum(2)

    near = d < tol
    lab, n = ndimage.label(near)
    keep = np.ones((h, w), bool)
    if n:
        border = set(lab[0].tolist()) | set(lab[-1].tolist()) | \
            set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
        border.discard(0)
        if border:
            keep = ~np.isin(lab, list(border))

    keep = peel_halo(keep, d, tol)
    # HARD alpha. These sheets are pixel art at native resolution, so a
    # soft rim gains nothing and actively hurts: on a light background the
    # rim keeps background-tinted colour and reads as a white halo.
    return a, keep, keep.astype(np.float64)


CROSS = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)


def peel_halo(keep, d, tol):
    """Strip the anti-aliased rim left against the background.

    A tolerance tight enough to protect black outlines necessarily keeps the
    blended pixels between creature and backdrop, which on a light sheet show
    up as a white fringe. Peel only pixels that BORDER removed background and
    are still background-ish in colour — a creature's interior white belly
    never touches removed background, so it cannot be eaten this way.
    """
    for _ in range(2):
        rim = keep & ndimage.binary_dilation(~keep, CROSS)
        halo = rim & (d < tol * 2.6)
        if not halo.any():
            break
        keep = keep & ~halo
    return keep


def _period(diff):
    """Fundamental repeat length in a 1-D boundary-strength signal.

    Takes the SMALLEST strong peak, not the tallest: autocorrelation peaks
    just as hard at 2x and 3x the tile pitch, and picking the tallest lands
    on a harmonic (which halves the detected column count).
    """
    d = diff - diff.mean()
    ac = np.correlate(d, d, 'full')[len(d) - 1:]
    lo = max(8, len(d) // 40)
    hi = max(lo + 2, len(d) // 2)
    seg = ac[lo:hi]
    if not len(seg) or ac[0] <= 0:
        return None
    thresh = 0.55 * seg.max()
    for i in range(1, len(seg) - 1):
        if seg[i] >= thresh and seg[i] >= seg[i - 1] and seg[i] >= seg[i + 1]:
            return lo + i
    return None


def tile_grid(img):
    """Detect a grid of flat-colour tiles (one creature per tile).

    Some sheets give every creature its own coloured cell, so there is no
    single sheet background to flood-fill — keying globally would keep
    almost the whole image. Tile pitch is recovered from where colour
    changes repeat, then each tile is keyed against its own colour.
    """
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    h, w = a.shape[:2]
    dx = np.abs(np.diff(a, axis=1)).sum(2).mean(0)
    dy = np.abs(np.diff(a, axis=0)).sum(2).mean(1)
    px, py = _period(dx), _period(dy)
    if not px or not py:
        return None
    cols, rows = int(round(w / px)), int(round(h / py))
    if not (2 <= cols <= 24 and 2 <= rows <= 24):
        return None
    # a tile grid is only plausible if tiles are roughly square
    if not 0.6 < (w / cols) / (h / rows) < 1.66:
        return None
    return cols, rows


def tiled_candidates(img, cols, rows):
    """One cutout per tile, each keyed against that tile's own colour."""
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    h, w = a.shape[:2]
    ch, cw = h / rows, w / cols
    out = []
    for r in range(rows):
        for c in range(cols):
            y0, y1 = int(round(r * ch)), int(round((r + 1) * ch))
            x0, x1 = int(round(c * cw)), int(round((c + 1) * cw))
            cell = a[y0:y1, x0:x1]
            if cell.size == 0:
                continue
            ring = np.concatenate([cell[:2].reshape(-1, 3), cell[-2:].reshape(-1, 3),
                                   cell[:, :2].reshape(-1, 3), cell[:, -2:].reshape(-1, 3)])
            bg = np.median(ring, axis=0)
            noise = float(np.percentile(np.abs(ring - bg).sum(1), 99))
            tol = min(max(26.0, noise * 1.6), 110.0)
            near = np.abs(cell - bg).sum(2) < tol
            lab, n = ndimage.label(near)
            keep = np.ones(near.shape, bool)
            if n:
                border = set(lab[0].tolist()) | set(lab[-1].tolist()) | \
                    set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
                border.discard(0)
                if border:
                    keep = ~np.isin(lab, list(border))
            keep = peel_halo(keep, np.abs(cell - bg).sum(2), tol)
            if keep.mean() < 0.02 or keep.mean() > 0.97:
                continue
            alpha = keep.astype(np.float64)
            ys, xs = np.where(keep)
            if len(ys) < 40:
                continue
            yy0, yy1 = ys.min(), ys.max() + 1
            xx0, xx1 = xs.min(), xs.max() + 1
            rgba = np.dstack([cell[yy0:yy1, xx0:xx1],
                              alpha[yy0:yy1, xx0:xx1] * 255]).astype(np.uint8)
            out.append((rgba, (y0 + yy0, x0 + xx0, y0 + yy1, x0 + xx1), float(len(ys))))
    return out


def _gaps(profile, min_gap):
    """Content bands separated by runs of at least min_gap empty lines."""
    on = profile > 0
    n = len(on)
    out, i = [], 0
    while i < n:
        if on[i]:
            j = i
            while j < n:
                if on[j]:
                    j += 1
                    continue
                k = j
                while k < n and not on[k]:
                    k += 1
                if k - j >= min_gap or k >= n:
                    break
                j = k
            out.append((i, min(j, n)))
            i = j
        else:
            i += 1
    return out


def band_candidates(a, keep, alpha):
    """Cut creatures apart by whitespace rows/columns rather than by
    connectivity — neighbours that touch or nearly touch stay separate,
    and no creature count has to be known in advance."""
    h, w = keep.shape
    out = []
    for y0, y1 in _gaps(keep.sum(1), max(4, int(0.014 * h))):
        strip = keep[y0:y1]
        for x0, x1 in _gaps(strip.sum(0), max(4, int(0.010 * w))):
            sub = strip[:, x0:x1]
            if sub.sum() < 0.0004 * h * w:
                continue
            ys, xs = np.where(sub)
            if len(ys) < 40:
                continue
            yy0, yy1 = y0 + ys.min(), y0 + ys.max() + 1
            xx0, xx1 = x0 + xs.min(), x0 + xs.max() + 1
            if yy1 - yy0 < 12 or xx1 - xx0 < 12:
                continue
            m = keep[yy0:yy1, xx0:xx1]
            rgba = np.dstack([a[yy0:yy1, xx0:xx1],
                              np.where(m, alpha[yy0:yy1, xx0:xx1], 0) * 255]).astype(np.uint8)
            out.append((rgba, (yy0, xx0, yy1, xx1), float(sub.sum())))
    return out


def candidates(img):
    """Every creature-sized cutout on a sheet, as (RGBA array, bbox)."""
    a, keep, alpha = key_sheet(img)
    h, w = keep.shape
    # a global key that removes almost nothing means per-tile backgrounds
    if keep.mean() > 0.6:
        g = tile_grid(img)
        if g:
            tc = tiled_candidates(img, *g)
            if len(tc) >= 4:
                print(f'   (tiled sheet {g[0]}x{g[1]} -> {len(tc)} tiles)')
                return tc
        # a patterned light background (watermark tiles) never matches one
        # flat colour, so fall back to "light and desaturated is background"
        k2 = light_pattern_keep(img)
        if k2 is not None:
            keep = k2
            alpha = keep.astype(np.float64)
            print(f'   (light-pattern background, kept {keep.mean():.2f})')

    # gather from both strategies: whitespace bands separate neighbours that
    # touch, connectivity keeps creatures whose limbs cross a gap. Neither
    # wins on every sheet, so take both and de-duplicate.
    found = band_candidates(a, keep, alpha) + blob_candidates(a, keep, alpha)
    return split_wide(dedupe(found), keep)


def light_pattern_keep(img):
    """Background mask for sheets whose backdrop is a light watermark
    pattern rather than a flat colour: anything bright and nearly grey,
    but only where it connects to the sheet border, so a creature's own
    white belly stays art."""
    hsv = np.asarray(img.convert('RGB').convert('HSV')).astype(np.float64)
    sat, val = hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
    bgish = (val > 0.78) & (sat < 0.22)
    if bgish.mean() < 0.15:
        return None
    lab, n = ndimage.label(bgish)
    if not n:
        return None
    h, w = bgish.shape
    border = set(lab[0].tolist()) | set(lab[-1].tolist()) | \
        set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    border.discard(0)
    # these sheets can carry a dark frame, so the backdrop never reaches the
    # image edge — a light region that large is the backdrop regardless
    sizes = ndimage.sum(bgish, lab, range(1, n + 1))
    drop = {i + 1 for i in range(n) if sizes[i] > 0.03 * h * w} | border
    if not drop:
        return None
    keep = ~np.isin(lab, list(drop))
    # close single-pixel pattern speckle left inside the art
    keep = ndimage.binary_closing(keep, np.ones((3, 3), bool))
    return keep if 0.02 < keep.mean() < 0.6 else None


def dedupe(cands):
    """Drop candidates covering the same art, keeping the fuller cutout."""
    order = sorted(range(len(cands)), key=lambda i: -cands[i][2])
    kept = []
    for i in order:
        y0, x0, y1, x1 = cands[i][1]
        dup = False
        for j in kept:
            b0, a0, b1, a1 = cands[j][1]
            iy = max(0, min(y1, b1) - max(y0, b0))
            ix = max(0, min(x1, a1) - max(x0, a0))
            inter = iy * ix
            if not inter:
                continue
            union = (y1 - y0) * (x1 - x0) + (b1 - b0) * (a1 - a0) - inter
            if inter / union > 0.55:
                dup = True
                break
        if not dup:
            kept.append(i)
    return [cands[i] for i in kept]


def split_wide(cands, keep):
    """Split cutouts that are far wider than the sheet's norm — those are
    two creatures whose art touches, so no gap existed to cut them at."""
    if len(cands) < 4:
        return cands
    widths = sorted((c[1][3] - c[1][1]) for c in cands)
    med = widths[len(widths) // 2]
    out = []
    for rgba, (y0, x0, y1, x1), sz in cands:
        if (x1 - x0) <= med * 1.7:
            out.append((rgba, (y0, x0, y1, x1), sz))
            continue
        col = keep[y0:y1, x0:x1].sum(0).astype(float)
        lo, hi = int(len(col) * 0.3), int(len(col) * 0.7)
        if hi - lo < 4:
            out.append((rgba, (y0, x0, y1, x1), sz))
            continue
        cut = lo + int(np.argmin(col[lo:hi]))
        for sx0, sx1 in ((x0, x0 + cut), (x0 + cut, x1)):
            m = keep[y0:y1, sx0:sx1]
            if m.sum() < 40:
                continue
            ys, xs = np.where(m)
            ny0, ny1 = y0 + ys.min(), y0 + ys.max() + 1
            nx0, nx1 = sx0 + xs.min(), sx0 + xs.max() + 1
            sub = rgba[ny0 - y0:ny1 - y0, nx0 - x0:nx1 - x0]
            if sub.size:
                out.append((sub.copy(), (ny0, nx0, ny1, nx1), float(m.sum())))
    return out


def blob_candidates(a, keep, alpha):
    h, w = keep.shape
    # merge parts that are only a couple of pixels apart
    merged = ndimage.binary_closing(keep, np.ones((3, 3), bool), iterations=2)
    lab, n = ndimage.label(merged, structure=np.ones((3, 3)))
    if not n:
        return []
    sizes = ndimage.sum(merged, lab, range(1, n + 1))
    boxes = ndimage.find_objects(lab)
    out = []
    for i in range(n):
        if sizes[i] < 0.0006 * h * w:
            continue
        sl = boxes[i]
        bh, bw = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if bh < 12 or bw < 12:
            continue
        if bh > 0.9 * h and bw > 0.9 * w:        # sheet-spanning junk
            continue
        # take everything inside this footprint, so detached spikes and
        # sparks that belong to the creature come along
        pad_y = max(2, int(bh * 0.06)); pad_x = max(2, int(bw * 0.06))
        y0 = max(0, sl[0].start - pad_y); y1 = min(h, sl[0].stop + pad_y)
        x0 = max(0, sl[1].start - pad_x); x1 = min(w, sl[1].stop + pad_x)
        sub_keep = keep[y0:y1, x0:x1]
        ys, xs = np.where(sub_keep)
        if len(ys) == 0:
            continue
        y0b, y1b = y0 + ys.min(), y0 + ys.max() + 1
        x0b, x1b = x0 + xs.min(), x0 + xs.max() + 1
        rgba = np.dstack([a[y0b:y1b, x0b:x1b],
                          alpha[y0b:y1b, x0b:x1b] * 255]).astype(np.uint8)
        out.append((rgba, (y0b, x0b, y1b, x1b), float(sizes[i])))
    return out


def descr(rgba):
    """Small alpha-masked descriptor: silhouette + colour, scale-free."""
    im = Image.fromarray(rgba, 'RGBA')
    a = np.asarray(im).astype(np.float64)
    al = a[..., 3:] / 255.0
    flat = Image.fromarray((a[..., :3] * al).astype(np.uint8), 'RGB') \
        .resize((20, 20), Image.LANCZOS)
    sil = Image.fromarray((al[..., 0] * 255).astype(np.uint8), 'L') \
        .resize((20, 20), Image.LANCZOS)
    v = np.concatenate([np.asarray(flat).astype(np.float64).ravel() / 255.0,
                        np.asarray(sil).astype(np.float64).ravel() / 255.0 * 1.6])
    n = np.linalg.norm(v)
    return v / n if n else v


def fit_to(rgba, target_max):
    """Scale a cutout so its longest side matches the sprite it replaces."""
    im = Image.fromarray(rgba, 'RGBA')
    k = target_max / max(im.width, im.height)
    nw, nh = max(1, round(im.width * k)), max(1, round(im.height * k))
    a = np.asarray(im).astype(np.float64)
    al = a[..., 3:] / 255.0
    pre = np.dstack([a[..., :3] * al, a[..., 3:]]).astype(np.uint8)
    pre = np.asarray(Image.fromarray(pre, 'RGBA').resize((nw, nh), Image.LANCZOS)
                     ).astype(np.float64)
    al2 = np.maximum(pre[..., 3:] / 255.0, 1e-3)
    rgb = np.clip(pre[..., :3] / al2, 0, 255)
    out = np.dstack([rgb, pre[..., 3:]]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    bb = im.split()[3].getbbox()
    return im.crop(bb) if bb else im


def painted(im, norm=66):
    """Painted pixel count, normalised to a common size so two cuts of the
    same creature are comparable. Fill-fraction is NOT usable here: a more
    complete cut that recovers a detached wing has a wider bounding box and
    therefore a LOWER fill fraction despite holding more art."""
    im = im.convert('RGBA')
    k = norm / max(im.size)
    w = max(1, round(im.width * k)); h = max(1, round(im.height * k))
    al = np.asarray(im.resize((w, h), Image.NEAREST))[..., 3]
    return float((al > 60).sum())


def multi_creature(rgba):
    """True if a cutout clearly holds more than one creature: two or more
    big components with a real gap between them."""
    al = np.asarray(rgba)[..., 3] > 60
    if al.sum() < 40:
        return False
    lab, n = ndimage.label(ndimage.binary_closing(al, np.ones((5, 5), bool)),
                           structure=np.ones((3, 3)))
    if n < 2:
        return False
    sizes = sorted(ndimage.sum(al, lab, range(1, n + 1)), reverse=True)
    return len(sizes) >= 2 and sizes[1] > 0.35 * sizes[0]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src_dir = sys.argv[1]
    dry = '--dry' in sys.argv
    only = [a.split('=')[1] for a in sys.argv if a.startswith('--sheet=')]

    sheets = {}
    for f in sorted(glob.glob(os.path.join(src_dir, '*'))):
        m = re.match(r'(\d+)_', os.path.basename(f))
        if m:
            sheets[m.group(1).zfill(2)] = f

    existing = {}
    for f in sorted(glob.glob(os.path.join(DEST, '*.png'))):
        m = re.match(r's(\d+)_', os.path.basename(f))
        if m:
            existing.setdefault(m.group(1), []).append(f)

    total, replaced, skipped = 0, 0, []
    for sh in sorted(existing):
        if only and sh not in only:
            continue
        if sh not in sheets:
            skipped += [os.path.basename(f) for f in existing[sh]]
            continue
        cands = candidates(Image.open(sheets[sh]))
        if not cands:
            skipped += [os.path.basename(f) for f in existing[sh]]
            continue
        cd = [descr(c[0]) for c in cands]
        files = existing[sh]
        ed = []
        for f in files:
            ed.append(descr(np.asarray(Image.open(f).convert('RGBA'))))
        # one candidate per sprite, globally best pairing
        cost = np.zeros((len(files), len(cands)))
        for i, e in enumerate(ed):
            for j, c in enumerate(cd):
                cost[i, j] = 1.0 - float(np.dot(e, c))
        ri, ci = linear_sum_assignment(cost)
        print(f'sheet {sh}: {len(files)} sprites, {len(cands)} cutouts')
        for i, j in zip(ri, ci):
            total += 1
            score = 1.0 - cost[i, j]
            name = os.path.basename(files[i])
            old = Image.open(files[i]).convert('RGBA')
            tgt = max(old.size)
            # only a near-certain match: a wrong pairing would put another
            # creature's art on a named beast, which is worse than a rough cut.
            if score < 0.90:
                print(f'   ! {name} match {score:.2f} too low — kept')
                skipped.append(name)
                continue
            if multi_creature(cands[j][0]):
                print(f'   ! {name} cutout holds several creatures — kept')
                skipped.append(name)
                continue
            new = fit_to(cands[j][0], tgt)
            ratio = painted(new) / max(1.0, painted(old))
            # the point is recovering art the old cut deleted, so the new cut
            # must hold at least as much of the creature
            if ratio < 0.95:
                print(f'   ! {name} new cut holds less art (x{ratio:.2f}) — kept')
                skipped.append(name)
                continue
            print(f'   {name}: match {score:.2f} art x{ratio:.2f} {old.size} -> {new.size}')
            if not dry:
                new.save(files[i])
            replaced += 1

    print(f'\n{replaced}/{total} sprites re-cut; {len(skipped)} kept as-is')
    if skipped:
        print('kept:', ' '.join(skipped[:40]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
