#!/usr/bin/env python3
"""Turn the CC0 FX filmstrips into one atlas the game can animate.

Source: Superpowers "RPG Battle System" asset pack by Pixel-boy / Sparklin Labs,
released CC0. Fetched from github.com/sparklinlabs/superpowers-asset-packs.

The strips are horizontal filmstrips with transparent gutters between frames, so
frames are found by locating runs of non-empty columns rather than by assuming a
fixed cell size — the strips are not all evenly divisible.

Outputs:
  assets/ui/vfx.png    one row per effect, uniform cell, trimmed and centred
  js/vfx-atlas.js      frame counts + cell size + effect->row mapping
"""
import os
import json
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'vfx-src')
OUT = os.path.join(ROOT, 'assets', 'ui')

# (effect key, strip, forced frame count or None, frame slice or None)
#
# Most strips split correctly from the inferred pitch. Two need help: `holy`'s
# radiant frames touch each other so no gap-free division above N=3 exists, and
# `fx8` is really two animations end to end — falling rocks then ground debris —
# so it becomes two effects.
EFFECTS = [
    ('sparkring', 'fx1',  None, None),   # star flash into expanding ring — impact / ult
    ('bolt',      'fx2',  None, None),   # lightning bolt — Electric
    ('claw',      'fx3',  None, None),   # triple claw slash — Metal / physical
    ('crescent',  'fx4',  None, None),   # crescent sweep, gold into violet — Shadow
    ('arc',       'fx5',  None, None),   # single arc slash — default hit
    ('cross',     'fx6',  None, None),   # X slash — crit
    ('heal',      'fx7',  None, None),   # rising plus signs — heal / feed
    ('rubble',    'fx8',  11,   (0, 6)),  # rocks bursting up — Earth
    ('ground',    'fx8',  11,   (6, 11)), # debris settling — landing / heavy impact
    ('fireball',  'fx9',  None, None),   # fireball detonation — Fire
    ('scratch',   'fx10', None, None),   # quick claw scratch — fast skill
    ('flame',     'fx11', None, None),   # flame plume — Fire column / burn
    ('holy',      'fx12', 6,    None),   # radiant cross burst — Mystic / ultimate
    ('dust',      'fx13', None, None),   # brown dust cloud — impact dust
    ('swirl',     'fx14', None, None),   # water spiral — Water / Ice
]
CELL = 96          # atlas cell, big enough for the widest frame after scaling


def content_runs(im):
    """Runs of columns that contain any pixel."""
    a = np.asarray(im.convert('RGBA'))
    col = (a[..., 3] > 8).any(axis=0)
    runs, s = [], None
    for x, v in enumerate(col):
        if v and s is None:
            s = x
        elif not v and s is not None:
            runs.append((s, x)); s = None
    if s is not None:
        runs.append((s, len(col)))
    return [r for r in runs if r[1] - r[0] >= 3]


def split_uniform(im, n):
    pitch = im.width / n
    cells = [im.crop((round(i * pitch), 0, round((i + 1) * pitch), im.height))
             for i in range(n)]
    return [c for c in cells if c.split()[3].getbbox()]


def frames_of(im):
    """Split a filmstrip into frames.

    Gap-splitting alone is wrong on these strips: an X-shaped slash reads as two
    runs and a heal frame's detached sparkles read as several, so a 5-frame strip
    comes out as 12. Instead infer the frame pitch — the strips are authored on a
    uniform grid, so pick the largest N whose equal cells never cut a content run
    in half. That upper-bounds the split at the real frame count.
    """
    runs = content_runs(im)
    if not runs:
        return []
    W = im.width
    best = 1
    for n in range(1, 17):
        pitch = W / n
        # every run must sit inside a single cell
        if all(int(r[0] // pitch) == int((r[1] - 1) // pitch) for r in runs):
            best = n
    if best > 1:
        pitch = W / best
        cells = [im.crop((round(i * pitch), 0, round((i + 1) * pitch), im.height))
                 for i in range(best)]
        return [c for c in cells if c.split()[3].getbbox()]
    return [im.crop((x0, 0, x1, im.height)) for x0, x1 in runs]


def fit(fr, cell):
    """Scale a frame to fit the cell, keeping aspect, centred."""
    bb = fr.split()[3].getbbox()
    if not bb:
        return Image.new('RGBA', (cell, cell))
    fr = fr.crop(bb)
    k = min((cell - 4) / fr.width, (cell - 4) / fr.height, 1.6)
    w, h = max(1, round(fr.width * k)), max(1, round(fr.height * k))
    fr = fr.resize((w, h), Image.LANCZOS)
    c = Image.new('RGBA', (cell, cell))
    c.paste(fr, ((cell - w) // 2, (cell - h) // 2))
    return c


def main():
    rows, meta = [], []
    for key, stem, forced, sl in EFFECTS:
        p = os.path.join(SRC, stem + '.png')
        if not os.path.exists(p):
            print('missing', p); continue
        strip = Image.open(p).convert('RGBA')
        fr = split_uniform(strip, forced) if forced else frames_of(strip)
        if sl:
            fr = fr[sl[0]:sl[1]]
        if not fr:
            print('no frames in', stem); continue
        rows.append([fit(f, CELL) for f in fr])
        meta.append({'key': key, 'frames': len(fr), 'src': stem})
        tag = '  (forced)' if forced else ''
        print(f'{key:10} {stem:5} {len(fr):2} frames{tag}')

    cols = max(len(r) for r in rows)
    sheet = Image.new('RGBA', (cols * CELL, len(rows) * CELL))
    for ri, r in enumerate(rows):
        for ci, f in enumerate(r):
            sheet.paste(f, (ci * CELL, ri * CELL))

    # palette-quantize with an explicit transparent index, same as the other sheets
    alpha = sheet.split()[3]
    flat = Image.new('RGB', sheet.size, (0, 0, 0))
    flat.paste(sheet.convert('RGB'), mask=alpha)
    N = 128
    q = flat.quantize(colors=N - 1, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()[:(N - 1) * 3]
    pal += [0] * (N * 3 - len(pal))
    idx = np.asarray(q).copy()
    idx[np.asarray(alpha) <= 128] = N - 1
    out = Image.fromarray(idx, 'P')
    out.putpalette(pal)
    out.save(os.path.join(OUT, 'vfx.png'), optimize=False,
             transparency=bytes([255] * (N - 1) + [0]))

    js = ('/* generated by tools/build-vfx.py — do not hand-edit.\n'
          '   Art: Superpowers RPG Battle System pack by Pixel-boy / Sparklin Labs (CC0). */\n'
          "window.VFX_ATLAS = " + json.dumps({
              'cell': CELL, 'cols': cols, 'rows': len(rows),
              'effects': {m['key']: {'row': i, 'frames': m['frames']}
                          for i, m in enumerate(meta)},
          }, indent=1) + ';\n')
    open(os.path.join(ROOT, 'js', 'vfx-atlas.js'), 'w').write(js)
    kb = os.path.getsize(os.path.join(OUT, 'vfx.png')) / 1000
    print(f'\natlas {sheet.size[0]}x{sheet.size[1]}  {cols} cols x {len(rows)} rows  {kb:.1f}KB')


if __name__ == '__main__':
    main()
