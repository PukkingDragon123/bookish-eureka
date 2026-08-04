#!/usr/bin/env python3
"""Cut the uploaded art sheets into game-ready spritesheets.

The uploads are big flat-background grids: tiered equipment (4x5), crops
(5 columns of 5 growth/product rows) and hobby icons (5x2). Each cell is
background-removed by flood-filling inward from the border — a global colour
threshold would punch holes in sprites that legitimately contain the sheet's
background hue — then trimmed, downscaled and re-hardened so the alpha stays
crisp at pixel-art sizes.

Outputs:
  assets/ui/gear.png    6 categories x 9 tiers, 64px cells
  assets/ui/plants.png  9 elements x 4 growth stages, 64px cells
  assets/ui/crops.png   9 harvested crop items, 48px cells
  assets/ui/hobby.png   30 hobby / activity icons, 64px cells
  css/farm-art.css      background-position helpers for all of the above
"""
import os
import json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source-sheets')
OUT = os.path.join(ROOT, 'assets', 'ui')

# ---------------------------------------------------------------- sheet index
GEAR_SHEETS = [                     # (file, key, label)
    ('3D3298D4-84ED-4A7D-A6F9-C857CC1580F6.png', 'sword',    'Blade'),
    ('4AFAB3FC-7146-4A13-9B9A-6DA6214812A0.png', 'axe',      'Axe'),
    ('FEF36C78-817F-4142-99FE-5F49E196177C.png', 'dagger',   'Dagger'),
    ('F7CA9EFD-A379-4782-A6F9-D0687B566690.png', 'helm',     'Helm'),
    ('120BEBAE-55F3-4085-B148-DFBFE2143E1C.png', 'gauntlet', 'Gauntlet'),
    ('91363756-BFF5-44E8-9B7E-F974552E46A5.png', 'ring',     'Ring'),
]
# 20 source tiers spread across the 9 the merge board uses, so tier 9 is
# unmistakably the legendary one rather than "slightly shinier than tier 8"
TIER_PICK = [0, 2, 4, 6, 9, 12, 15, 17, 19]

CROP_A = '3250EA70-F001-499B-8BF5-1ED22A76055E.png'
CROP_B = '803D7229-157C-41B5-AD04-C24C13CB6B7E.png'
# element -> (sheet, column). Row 4 is the seed, 0-2 are growth, 3 is the fruit.
CROP_COL = {
    'Fire': (CROP_A, 0), 'Water': (CROP_A, 1), 'Nature': (CROP_A, 2),
    'Electric': (CROP_A, 3), 'Shadow': (CROP_A, 4),
    'Ice': (CROP_B, 0), 'Earth': (CROP_B, 1),
    'Metal': (CROP_B, 3), 'Mystic': (CROP_B, 4),
}
ELEMENTS = ['Fire', 'Water', 'Nature', 'Electric', 'Ice',
            'Earth', 'Shadow', 'Mystic', 'Metal']
STAGE_ROWS = [4, 0, 1, 2]           # planted seed -> sprout -> young -> ripe

HOBBY_SHEETS = [
    ('E5DB9555-D516-4E31-BBFA-6E3449678D48.png',
     ['book', 'palette', 'headphones', 'chefhat', 'fishing',
      'runshoe', 'goggles', 'bikewheel', 'dumbbell', 'meditate']),
    ('B0FBC194-0656-4DAF-BC0E-BB809B554356.png',
     ['guitar', 'console', 'camera', 'sneaker', 'mic',
      'penbook', 'chess', 'sewing', 'telescope', 'backpack']),
    ('8BE17875-FC46-4DC8-ACAB-48F4C582B28D.png',
     ['sketch', 'swords', 'camera2', 'potion', 'salad',
      'trowel', 'chest', 'circle', 'wand', 'skull']),
]
CURRENCY = ('EBE80611-9F29-4362-82EB-E23F2667F0B8.png',
            ['coin', 'crystal', 'runeegg', 'fireegg'])

# newest upload: a 3x3 utility sheet
UTIL_SHEET = ('770A4DAA-607F-4D41-AB39-62E212DE9B14.png', 3, 3,
              ['can', 'sprout', 'play',
               'translate', 'swords2', 'dexbook',
               'dumbbell2', 'flask2', 'potion2'])

# The UI's semantic icon names, resolved to the user's own art. Nothing here is
# drawn by us — every cell comes from an uploaded sheet.
#   key -> (sheet file, cols, rows, cell index)
UI_ICONS = {
    'seed':    (UTIL_SHEET[0], 3, 3, 1),   # seedling
    'flask':   (UTIL_SHEET[0], 3, 3, 7),   # green flask
    'mana':    (UTIL_SHEET[0], 3, 3, 8),   # purple potion
    'sword':   (UTIL_SHEET[0], 3, 3, 4),   # crossed swords
    'book':    (UTIL_SHEET[0], 3, 3, 5),   # book + magnifier
    'play':    (UTIL_SHEET[0], 3, 3, 2),   # play arrow
    'can':     (UTIL_SHEET[0], 3, 3, 0),   # watering can
    'scroll':  ('B0FBC194-0656-4DAF-BC0E-BB809B554356.png', 5, 2, 5),   # book+pen
    'map':     ('B0FBC194-0656-4DAF-BC0E-BB809B554356.png', 5, 2, 9),   # backpack+map
    'meal':    ('8BE17875-FC46-4DC8-ACAB-48F4C582B28D.png', 5, 2, 4),   # salad
    'essence': ('8BE17875-FC46-4DC8-ACAB-48F4C582B28D.png', 5, 2, 3),   # red potion
    'chest':   ('8BE17875-FC46-4DC8-ACAB-48F4C582B28D.png', 5, 2, 6),   # chest
    'portal':  ('8BE17875-FC46-4DC8-ACAB-48F4C582B28D.png', 5, 2, 7),   # magic circle
    'skull':   ('8BE17875-FC46-4DC8-ACAB-48F4C582B28D.png', 5, 2, 9),   # skull
    'gold':    (CURRENCY[0], 4, 1, 0),     # coin
    'gem':     (CURRENCY[0], 4, 1, 1),     # crystal
    'relic':   (CURRENCY[0], 4, 1, 2),     # rune egg
    'streak':  (CURRENCY[0], 4, 1, 3),     # flame
    'bolt':    (CURRENCY[0], 4, 1, 3),     # flame doubles for the x3 boost
}
UI_CELL = 64

# ---- element icons: 3x3, exactly the nine types the game uses ----
ELEM_SHEET = ('ADA4A098-562C-4C7B-A043-22FFEAEAB879.png', 3, 3)
ELEM_ORDER = ['Fire', 'Water', 'Nature', 'Electric', 'Ice', 'Earth',
              'Shadow', 'Mystic', 'Metal']

# ---- spell icons: two 6x5 sheets, grouped by element. `SPELL_A` is cleanly
# element-ordered three-at-a-time; `SPELL_B` groups less regularly, so its
# element per cell is listed explicitly. Together they give ~6 per element,
# enough that two creatures of the same type rarely share a skill icon.
SPELL_A = ('A2A993CB-18C7-479F-B923-70909CC561B8.png', 6, 5)
SPELL_A_ELEMS = (['Fire'] * 3 + ['Water'] * 3 + ['Nature'] * 3 + ['Electric'] * 3 +
                 ['Ice'] * 3 + ['Earth'] * 3 + ['Shadow'] * 3 + ['Mystic'] * 3 +
                 ['Metal'] * 3 + ['Ultimate'] * 3)
SPELL_B = ('4484EC22-EA67-4E84-A21F-14EAC8FE3010.png', 6, 5)
SPELL_B_ELEMS = ['Fire', 'Fire', 'Fire', 'Water', 'Water', 'Ice',
                 'Nature', 'Nature', 'Nature', 'Electric', 'Electric', 'Electric',
                 'Ice', 'Ice', 'Ice', 'Earth', 'Earth', 'Ice',
                 'Shadow', 'Shadow', 'Shadow', 'Mystic', 'Mystic', 'Mystic',
                 'Metal', 'Metal', 'Metal', 'Fire', 'Earth', 'Shadow']
SPELL_CELL = 64


# ---------------------------------------------------------------- cutting out
def cut_bg(cell, tol=58):
    """Drop the flat sheet background and any hole it fills (a ring's centre is
    background too, and it never touches the border). Then drop specks that
    bled in from a neighbouring cell of the source grid."""
    a = np.asarray(cell.convert('RGB')).astype(int)
    h, w = a.shape[:2]
    corners = np.array([a[1, 1], a[1, w - 2], a[h - 2, 1], a[h - 2, w - 2]])
    bg = np.median(corners, axis=0)
    near = np.abs(a - bg).sum(2) < tol * 3

    lab, n = ndimage.label(near)
    kill = np.zeros(near.shape, bool)
    if n:
        sizes = ndimage.sum(near, lab, range(1, n + 1))
        border = set(lab[0].tolist()) | set(lab[-1].tolist()) | \
            set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
        border.discard(0)
        # enclosed background pockets count too, once they are big enough to be
        # a real hole rather than a dark pixel that happens to match
        drop = [i + 1 for i in range(n)
                if (i + 1) in border or sizes[i] > 0.004 * h * w]
        if drop:
            kill = np.isin(lab, drop)

    keep = ~kill
    lab2, n2 = ndimage.label(keep)
    if n2 > 1:
        sizes = ndimage.sum(keep, lab2, range(1, n2 + 1))
        biggest = sizes.max()
        m = max(2, int(min(h, w) * 0.05))
        edge = np.zeros(keep.shape, bool)
        edge[:m] = edge[-m:] = True
        edge[:, :m] = edge[:, -m:] = True
        for i in range(n2):
            if sizes[i] < 0.02 * biggest and (lab2 == i + 1)[edge].any():
                keep &= lab2 != i + 1

    out = np.dstack([a, np.where(keep, 255, 0)]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def trim(im):
    bb = im.split()[3].getbbox()
    return im.crop(bb) if bb else im


def harden(im, size, k=None, anchor='center'):
    """Fit inside a size x size box, then re-crisp the alpha edge.

    Pass k to scale by a shared factor instead of filling the box — growth
    stages have to keep their relative sizes or a seed ends up as big as a
    ripe plant."""
    im = trim(im)
    if im.width == 0 or im.height == 0:
        return Image.new('RGBA', (size, size))
    if k is None:
        k = min((size - 2) / im.width, (size - 2) / im.height)
    nw = max(1, min(size, round(im.width * k)))
    nh = max(1, min(size, round(im.height * k)))
    im = im.resize((nw, nh), Image.LANCZOS)

    a = np.asarray(im).astype(int)
    alpha = a[..., 3]
    solid = alpha > 118
    # colours bled toward the background during the downscale — pull each
    # surviving pixel back toward its nearest fully-opaque neighbour's tone
    rgb = a[..., :3]
    keep = alpha > 200
    if keep.any():
        idx = ndimage.distance_transform_edt(~keep, return_distances=False,
                                             return_indices=True)
        rgb = rgb[idx[0], idx[1]]
    out = np.dstack([rgb, np.where(solid, 255, 0)]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')

    im = trim(im)
    canvas = Image.new('RGBA', (size, size))
    y = size - im.height if anchor == 'bottom' else (size - im.height) // 2
    canvas.paste(im, ((size - im.width) // 2, max(0, y)))
    return canvas


def group_scale(cuts, size):
    """One scale factor for a set of sprites, sized off the largest."""
    boxes = [c.split()[3].getbbox() for c in cuts]
    big = max(max(b[2] - b[0], b[3] - b[1]) for b in boxes if b)
    return (size - 2) / big


def grid(path, cols, rows, inset=0.045):
    """Split into a uniform grid, shaving a little off every cell edge — the
    source rows are not perfectly aligned and a neighbour's tip otherwise
    bleeds in as a floating speck."""
    im = Image.open(os.path.join(SRC, path)).convert('RGB')
    cw, ch = im.width / cols, im.height / rows
    ix, iy = cw * inset, ch * inset
    return [[im.crop((round(c * cw + ix), round(r * ch + iy),
                      round((c + 1) * cw - ix), round((r + 1) * ch - iy)))
             for c in range(cols)] for r in range(rows)]


# ---------------------------------------------------------------- sheet build
def pack(cells, cols, size, path, colours=96):
    """Pack and palette-quantize. These are pixel art with hard alpha, so a
    small palette is visually lossless and keeps the inlined bundle sane."""
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * size, rows * size))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * size, (i // cols) * size))

    alpha = sheet.split()[3]
    flat = Image.new('RGB', sheet.size, (0, 0, 0))
    flat.paste(sheet.convert('RGB'), mask=alpha)
    q = flat.quantize(colors=colours - 1, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()[:(colours - 1) * 3]
    pal += [0] * ((colours * 3) - len(pal))          # pad, then a spare slot
    q.putpalette(pal)
    idx = np.asarray(q).copy()
    idx[np.asarray(alpha) <= 128] = colours - 1      # last index = transparent
    out = Image.fromarray(idx, 'P')
    out.putpalette(pal)
    out.save(os.path.join(OUT, path), optimize=False,
             transparency=bytes([255] * (colours - 1) + [0]))
    return out


def main():
    css = ['/* generated by tools/extract-new-art.py — do not hand-edit */']
    P = 64          # packed cell size for gear / plants / hobby

    # ---- gear: 6 categories x 9 tiers ----
    gear = []
    for path, key, _ in GEAR_SHEETS:
        g = grid(path, 4, 5)
        flat = [g[r][c] for r in range(5) for c in range(4)]
        for t in TIER_PICK:
            gear.append(harden(cut_bg(flat[t]), P))
    pack(gear, 9, P, 'gear.png')
    css.append(f'.gear{{width:32px;height:32px;background-image:url(../assets/ui/gear.png);'
               f'background-size:{9 * 32}px auto;image-rendering:pixelated;'
               f'display:inline-block;flex:none;}}')
    for gi, (_, key, _) in enumerate(GEAR_SHEETS):
        for t in range(9):
            css.append(f'.gear.g-{key}.t{t + 1}{{background-position:-{t * 32}px -{gi * 32}px;}}')
    css.append(f'.gear.big{{width:44px;height:44px;background-size:{9 * 44}px auto;}}')
    for gi, (_, key, _) in enumerate(GEAR_SHEETS):
        for t in range(9):
            css.append(f'.gear.big.g-{key}.t{t + 1}{{background-position:-{t * 44}px -{gi * 44}px;}}')

    # ---- plants: 9 elements x 4 stages, plus the harvested crop items ----
    cache = {}
    plants, crops = [], []
    for e in ELEMENTS:
        path, col = CROP_COL[e]
        if path not in cache:
            cache[path] = grid(path, 5, 5)
        g = cache[path]
        cuts = [cut_bg(g[r][col]) for r in STAGE_ROWS]
        k = group_scale(cuts, P)
        for c in cuts:
            plants.append(harden(c, P, k=k, anchor='bottom'))
        crops.append(harden(cut_bg(g[3][col]), 48))
    pack(plants, 4, P, 'plants.png')
    pack(crops, 9, 48, 'crops.png')

    css.append(f'.plant{{width:32px;height:32px;background-image:url(../assets/ui/plants.png);'
               f'background-size:{4 * 32}px auto;image-rendering:pixelated;display:inline-block;}}')
    for ei, e in enumerate(ELEMENTS):
        for s in range(4):
            css.append(f'.plant.p-{e.lower()}.s{s}{{background-position:-{s * 32}px -{ei * 32}px;}}')
    for scale, name in ((48, 'big'), (56, 'huge')):
        css.append(f'.plant.{name}{{width:{scale}px;height:{scale}px;background-size:{4 * scale}px auto;}}')
        for ei, e in enumerate(ELEMENTS):
            for s in range(4):
                css.append(f'.plant.{name}.p-{e.lower()}.s{s}'
                           f'{{background-position:-{s * scale}px -{ei * scale}px;}}')

    css.append(f'.crop{{width:24px;height:24px;background-image:url(../assets/ui/crops.png);'
               f'background-size:{9 * 24}px auto;image-rendering:pixelated;display:inline-block;flex:none;}}')
    for ei, e in enumerate(ELEMENTS):
        css.append(f'.crop.c-{e.lower()}{{background-position:-{ei * 24}px 0;}}')
    css.append(f'.crop.big{{width:40px;height:40px;background-size:{9 * 40}px auto;}}')
    for ei, e in enumerate(ELEMENTS):
        css.append(f'.crop.big.c-{e.lower()}{{background-position:-{ei * 40}px 0;}}')

    # ---- the UI icon set, entirely from uploaded art ----
    ui_keys, ui_cells = [], []
    gcache = {}
    for key, (fname, cols, rows_n, idx) in UI_ICONS.items():
        ck = (fname, cols, rows_n)
        if ck not in gcache:
            gcache[ck] = grid(fname, cols, rows_n)
        g = gcache[ck]
        cell = g[idx // cols][idx % cols]
        ui_cells.append(harden(cut_bg(cell), UI_CELL))
        ui_keys.append(key)
    UICOLS = 8
    pack(ui_cells, UICOLS, UI_CELL, 'ui-icons.png')
    # A bare `.ico` renders as nothing: only a key that exists in the uploaded
    # art turns it into a box, so an icon name with no artwork vanishes cleanly
    # instead of leaving a broken empty square.
    #
    # The url() lives on ONE grouped selector per size, not on every key: the
    # bundler inlines the sheet at each url(), so repeating it across 19 keys x
    # 3 sizes embedded the same PNG 57 times and added 1.6MB to the build.
    icss = ['/* generated by tools/extract-new-art.py from the uploaded sheets.',
            '   Every cell is user-supplied art — the build draws no icons itself. */',
            '.ico{display:none;}']
    for size, sel in ((22, ''), (32, '.big'), (46, '.huge')):
        group = ','.join(f'.ico{sel}.ico-{k}' for k in ui_keys)
        icss.append(
            f'{group}{{display:inline-block;flex:none;'
            f'width:{size}px;height:{size}px;'
            f'background-image:url(../assets/ui/ui-icons.png);'
            f'background-size:{UICOLS * size}px auto;'
            f'image-rendering:pixelated;vertical-align:-{round(size * 0.22)}px;}}')
        for i, k in enumerate(ui_keys):
            icss.append(f'.ico{sel}.ico-{k}{{background-position:'
                        f'-{(i % UICOLS) * size}px -{(i // UICOLS) * size}px;}}')
    open(os.path.join(ROOT, 'css', 'ui-icons.css'), 'w').write('\n'.join(icss) + '\n')
    print(f'ui-icons  {len(ui_keys)} icons from uploaded sheets: {" ".join(ui_keys)}')

    # ---- element icons ----
    eg = grid(ELEM_SHEET[0], ELEM_SHEET[1], ELEM_SHEET[2])
    ecells = [harden(cut_bg(eg[i // 3][i % 3]), UI_CELL) for i in range(9)]
    pack(ecells, 9, UI_CELL, 'elements.png')
    ecss = ['/* generated by tools/extract-new-art.py from the uploaded element sheet */']
    for size, sel in ((22, ''), (30, '.big'), (44, '.huge')):
        grp = ','.join(f'.elem{sel}.el-{e.lower()}' for e in ELEM_ORDER)
        ecss.append(f'{grp}{{display:inline-block;flex:none;width:{size}px;height:{size}px;'
                    f'background-image:url(../assets/ui/elements.png);'
                    f'background-size:{9 * size}px auto;image-rendering:pixelated;'
                    f'vertical-align:-{round(size * 0.22)}px;}}')
        for i, e in enumerate(ELEM_ORDER):
            ecss.append(f'.elem{sel}.el-{e.lower()}{{background-position:-{i * size}px 0;}}')
    open(os.path.join(ROOT, 'css', 'elements.css'), 'w').write('\n'.join(ecss) + '\n')
    print(f'elements  9 icons')

    # ---- spell icons, packed element-major so a creature can pick by type ----
    spells, by_elem = [], {}
    for (sheet, cols, rows_n), elems in ((SPELL_A, SPELL_A_ELEMS), (SPELL_B, SPELL_B_ELEMS)):
        g = grid(sheet, cols, rows_n)
        for i, e in enumerate(elems):
            by_elem.setdefault(e, []).append(harden(cut_bg(g[i // cols][i % cols]), SPELL_CELL))
    order = []
    for e in ELEM_ORDER + ['Ultimate']:
        for cell in by_elem.get(e, []):
            spells.append(cell); order.append(e)
    SCOLS = 8
    pack(spells, SCOLS, SPELL_CELL, 'skills.png')
    scss = ['/* generated by tools/extract-new-art.py from the uploaded spell sheets */']
    for size, sel in ((26, ''), (34, '.big'), (48, '.huge')):
        grp = ','.join(f'.spell{sel}.sp-{i}' for i in range(len(spells)))
        scss.append(f'{grp}{{display:inline-block;flex:none;width:{size}px;height:{size}px;'
                    f'background-image:url(../assets/ui/skills.png);'
                    f'background-size:{SCOLS * size}px auto;image-rendering:pixelated;'
                    f'vertical-align:-{round(size * 0.22)}px;}}')
        for i in range(len(spells)):
            scss.append(f'.spell{sel}.sp-{i}{{background-position:'
                        f'-{(i % SCOLS) * size}px -{(i // SCOLS) * size}px;}}')
    open(os.path.join(ROOT, 'css', 'skills.css'), 'w').write('\n'.join(scss) + '\n')
    # which sprite indices belong to which element, for deterministic assignment
    ranges = {}
    for i, e in enumerate(order):
        ranges.setdefault(e, []).append(i)
    open(os.path.join(ROOT, 'js', 'skill-icons.js'), 'w').write(
        '/* generated by tools/extract-new-art.py */\nwindow.SKILL_ICONS = '
        + json.dumps(ranges) + ';\n')
    print('skills    ' + ' '.join(f'{e}:{len(v)}' for e, v in ranges.items()))

    # ---- the mentor NPC ----
    npc = Image.open(os.path.join(SRC, 'npc-mentor.png')).convert('RGBA')
    a = np.asarray(npc)
    if (a[..., 3] > 8).sum() < 0.02 * a.shape[0] * a.shape[1]:
        npc = cut_bg(npc.convert('RGB'))          # sheet had no usable alpha
    else:
        npc = cut_bg(npc)
    npc = harden(npc, 192)
    npc.save(os.path.join(OUT, 'npc.png'))
    print('npc       mentor sprite 192px')

    # ---- hobby / activity icons ----
    hob, names = [], []
    for path, keys in HOBBY_SHEETS:
        g = grid(path, 5, 2)
        for r in range(2):
            for c in range(5):
                hob.append(harden(cut_bg(g[r][c]), P))
                names.append(keys[r * 5 + c])
    cpath, ckeys = CURRENCY
    g = grid(cpath, 4, 1)
    for c in range(4):
        hob.append(harden(cut_bg(g[0][c]), P))
        names.append(ckeys[c])
    COLS = 8
    pack(hob, COLS, P, 'hobby.png')
    for scale, sel in ((24, '.hob'), (34, '.hob.big'), (48, '.hob.huge')):
        if sel == '.hob':
            css.append(f'.hob{{width:24px;height:24px;background-image:url(../assets/ui/hobby.png);'
                       f'background-size:{COLS * 24}px auto;image-rendering:pixelated;'
                       f'display:inline-block;flex:none;vertical-align:-5px;}}')
        else:
            css.append(f'{sel}{{width:{scale}px;height:{scale}px;background-size:{COLS * scale}px auto;}}')
        for i, n in enumerate(names):
            css.append(f'{sel}.h-{n}{{background-position:'
                       f'-{(i % COLS) * scale}px -{(i // COLS) * scale}px;}}')

    # keep the generated soil / fence / prop rules
    old = os.path.join(ROOT, 'css', 'farm-art.css')
    keep = []
    if os.path.exists(old):
        keep = [l for l in open(old).read().splitlines()
                if l.startswith('.prop')]
    with open(old, 'w') as fh:
        fh.write('\n'.join(css + keep) + '\n')

    print(f'gear {len(gear)} · plants {len(plants)} · crops {len(crops)} · icons {len(hob)}')


if __name__ == '__main__':
    main()
