#!/usr/bin/env python3
"""Draw the farm scene art and the dream icons.

Everything is generated pixel-by-pixel so it stays consistent with the rest of
the game's art: hard 1px outlines, small palettes, no anti-aliasing.

Outputs:
  assets/ui/soil.png        tilled soil bed tile (repeatable)
  assets/ui/soil-wet.png    watered variant
  assets/ui/fence.png       fence rail strip (repeatable)
  assets/ui/plants.png      9 elements x 4 growth stages, 32x32 cells
  assets/ui/props.png       watering can, scarecrow, butterfly, sun, cloud
  css/farm-art.css          background-position helpers for the plant sheet
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ui')
os.makedirs(OUT, exist_ok=True)

CELL = 32
SCALE = 2

# ---------------------------------------------------------------- soil / fence
SOIL = {
    'k': (32, 22, 14),    # trough shadow, almost black
    'd': (54, 38, 24),    # deep soil
    'm': (78, 55, 34),    # body of the ridge
    'l': (104, 76, 48),   # sunlit crest
    'h': (128, 98, 64),   # crumb highlight
    's': (62, 50, 40),    # small stone
}
# wet earth is darker and a touch cooler, not just dimmer
WET = {k: (int(v[0] * .60), int(v[1] * .62), int(v[2] * .72)) for k, v in SOIL.items()}


def soil_tile(pal):
    """One furrow of ploughed earth, 32x16, tiling in both directions.

    A real field is not stripes: each ridge wanders, catches light along its
    crest and drops into a dark trough. The wobble below is deterministic so
    the tile still repeats seamlessly, but it kills the plank look.
    """
    w, h = 32, 16
    im = Image.new('RGBA', (w, h))
    px = im.load()

    # a gentle 32px-period wander, symmetric so left and right edges meet
    def wobble(x):
        t = (x * 4 + (x * x) % 7) % 16
        return (0, 0, 1, 1, 1, 0, 0, -1, -1, -1, 0, 0, 1, 1, 0, -1)[t]

    for x in range(w):
        o = wobble(x)
        for y in range(h):
            r = (y - o) % h                     # row within this ridge
            if r <= 1:
                c = pal['k']                    # trough: deepest shade
            elif r <= 3:
                c = pal['d']
            elif r <= 6:
                c = pal['m']
            elif r <= 8:
                c = pal['l']                    # crest catching the sun
            elif r <= 11:
                c = pal['m']
            else:
                c = pal['d']
            # crumbs, clods and the odd stone
            n = (x * 7 + y * 13 + (x * y) % 5) % 29
            if n == 0 and 4 <= r <= 9:
                c = pal['h']
            elif n == 11:
                c = pal['k']
            elif n == 19 and r >= 4:
                c = pal['s']
            px[x, y] = c + (255,)
    return im


def fence_strip():
    """A 32x24 fence section: two rails and a post, tiles horizontally."""
    W = {'k': (40, 24, 12), 'd': (92, 58, 30), 'm': (132, 88, 46), 'l': (168, 118, 66)}
    w, h = 32, 24
    im = Image.new('RGBA', (w, h))
    px = im.load()

    def rect(x0, y0, x1, y1, top, body, outline=True):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if not (0 <= x < w and 0 <= y < h):
                    continue
                edge = outline and (x in (x0, x1) or y in (y0, y1))
                c = W['k'] if edge else (top if y <= y0 + 1 else body)
                px[x, y] = c + (255,)

    rect(0, 6, 31, 10, W['l'], W['m'])      # upper rail
    rect(0, 15, 31, 19, W['l'], W['m'])     # lower rail
    rect(5, 2, 11, 23, W['l'], W['d'])      # post
    # post cap notch
    for x in range(6, 11):
        px[x, 2] = W['k'] + (255,)
    return im


# ---------------------------------------------------------------- plants
# Per-element palette: (dark, mid, light, fruit-dark, fruit-light)
PLANT_PAL = {
    'Fire':     ((92, 40, 18), (150, 70, 26), (196, 106, 40), (170, 34, 24), (255, 128, 48)),
    'Water':    ((26, 74, 96), (40, 116, 148), (72, 164, 196), (30, 90, 176), (108, 194, 255)),
    'Nature':   ((32, 78, 32), (58, 126, 48), (96, 176, 70), (196, 48, 60), (255, 104, 108)),
    'Electric': ((104, 84, 20), (156, 132, 34), (206, 182, 56), (188, 148, 16), (255, 232, 96)),
    'Ice':      ((60, 100, 118), (96, 148, 170), (150, 200, 220), (110, 168, 208), (216, 246, 255)),
    'Earth':    ((70, 52, 30), (110, 84, 48), (150, 118, 70), (128, 92, 44), (196, 154, 86)),
    'Shadow':   ((48, 32, 68), (78, 54, 108), (116, 86, 156), (86, 40, 128), (168, 116, 224)),
    'Mystic':   ((88, 40, 92), (134, 66, 138), (180, 104, 184), (196, 74, 150), (255, 150, 226)),
    'Metal':    ((58, 66, 76), (94, 106, 120), (140, 154, 172), (110, 124, 142), (196, 210, 228)),
}
K = (30, 20, 10)


def plant_cell(pal, stage):
    """32x32 plant at a growth stage: 0 seeded mound, 1 sprout, 2 bush, 3 fruiting."""
    d, m, l, fd, fl = pal
    im = Image.new('RGBA', (CELL, CELL))
    px = im.load()

    def dot(x, y, c):
        if 0 <= x < CELL and 0 <= y < CELL and c:
            px[x, y] = c + (255,)

    def blob(cx, cy, rx, ry, body, edge, outline=True):
        """Filled ellipse with a darker rim and a hard outline ring."""
        for y in range(cy - ry - 1, cy + ry + 2):
            for x in range(cx - rx - 1, cx + rx + 2):
                dx = (x - cx) / max(0.6, rx)
                dy = (y - cy) / max(0.6, ry)
                v = dx * dx + dy * dy
                if v <= 1.0:
                    dot(x, y, edge if v > 0.52 else body)
                elif outline and v <= 1.62:
                    dot(x, y, K)

    def stalk(x, ytop, ybot):
        for y in range(ytop, ybot + 1):
            dot(x, y, m)
            dot(x + 1, y, d)
            dot(x - 1, y, K)
            dot(x + 2, y, K)

    base = 26
    # --- earth mound, present at every stage
    for x in range(9, 23):
        rise = 3 if 12 <= x <= 19 else (2 if 10 <= x <= 21 else 1)
        for y in range(base - rise + 1, base + 2):
            dot(x, y, (112, 74, 40) if y == base - rise + 1 else (88, 56, 28))
    for x in range(8, 24):
        dot(x, base + 2, K)
    dot(8, base, K); dot(23, base, K)
    for x in range(10, 22, 3):
        dot(x, base, (68, 42, 20))

    if stage == 0:
        # a seed tucked in, with the first pale tip breaking the surface
        blob(16, base - 3, 2, 2, (126, 88, 46), (92, 60, 30))
        dot(16, base - 6, l); dot(16, base - 7, l)
        dot(15, base - 6, K); dot(17, base - 6, K); dot(16, base - 8, K)

    elif stage == 1:
        stalk(15, base - 9, base - 1)
        blob(11, base - 10, 4, 3, l, m)      # left leaf
        blob(21, base - 9, 4, 3, l, m)       # right leaf
        blob(16, base - 12, 3, 2, l, m)      # crown tip

    elif stage == 2:
        stalk(15, base - 14, base - 1)
        blob(10, base - 8, 5, 3, m, d)
        blob(22, base - 10, 5, 3, m, d)
        blob(11, base - 15, 4, 3, l, m)
        blob(21, base - 16, 4, 3, l, m)
        blob(16, base - 19, 6, 4, l, m)      # bushy crown
        dot(14, base - 20, (255, 255, 255))

    else:
        stalk(15, base - 15, base - 1)
        blob(9, base - 7, 5, 4, d, d, outline=True)
        blob(23, base - 9, 5, 4, d, d, outline=True)
        blob(10, base - 13, 6, 4, m, d)
        blob(22, base - 15, 6, 4, m, d)
        blob(16, base - 20, 8, 5, l, m)      # full canopy
        # fruit hanging off both sides + one in the crown
        blob(8, base - 12, 3, 3, fl, fd)
        blob(24, base - 16, 3, 3, fl, fd)
        blob(16, base - 24, 3, 3, fl, fd)
        for (fx, fy) in ((7, base - 14), (23, base - 18), (15, base - 26)):
            dot(fx, fy, (255, 255, 255))
    return im


def plants_sheet():
    els = list(PLANT_PAL)
    sheet = Image.new('RGBA', (CELL * 4, CELL * len(els)))
    for r, e in enumerate(els):
        for s in range(4):
            sheet.paste(plant_cell(PLANT_PAL[e], s), (s * CELL, r * CELL))
    sheet = sheet.resize((sheet.width * SCALE, sheet.height * SCALE), Image.NEAREST)
    sheet.save(os.path.join(OUT, 'plants.png'))
    return els


# ---------------------------------------------------------------- props
PROPS = {
 'can': [  # watering can
  '................................','................................',
  '..........kkkkkkkkk.............','.........ksssssssssk............',
  '........kswwsssssssk...kkk......','.......ksswssssssssk..ks.sk.....',
  '.......ksssssssssssk.ks...sk....','.......kssssssssssskks.....k....',
  '.......ksssssssssssks......k....','.......ksssssssssssk.......k....',
  '.......ksssssssssssk......k.....','........kssssssssskkkkkkk......',
  '........kSSSSSSSSSk.............','.........kSSSSSSSk..............',
  '..........kkkkkkk...............','................................'],
 'scarecrow': [
  '..........kkkkk.................','.........kvvvvvk................',
  '.........kvkvkvk................','.........kvvvvvk................',
  '.........kvvvvvk................','..........kkkkk.................',
  '.....kkkkkkkkkkkkkkkk...........','....krrrrrrrrrrrrrrrrk..........',
  '....krrkrrrrrrrrrkrrrk..........','....krrkrrrrrrrrrkrrrk..........',
  '.....kkkrrrrrrrrrkkk............','.......krrrrrrrrrk..............',
  '.......krrrrrrrrrk..............','........kkkeeekkk...............',
  '..........keeek.................','..........keeek.................'],
 'butterfly': [
  '................................','................................',
  '................................','.........kk.......kk............',
  '........kppk.....kppk...........','.......kpwwpk...kpwwpk..........',
  '.......kppppk.kk.kpppk..........','........kpppkeek.kppk...........',
  '.........kppkeekkppk............','..........kkkeekkkk.............',
  '............keek................','............kkk.................',
  '................................','................................',
  '................................','................................'],
 'sun': [
  '................................','..........k.....k...............',
  '...........k...k................','......k.....kkk.....k...........',
  '.......k..kyyyyyk..k............','.........kyyyyyyyk..............',
  '........kyyyywwyyyk.............','...kkk.kyyyywwyyyyk.kkk.........',
  '........kyyyyyyyyk..............','.........kyyyyyyk...............',
  '.......k..kyyyyk..k.............','......k.....kkk.....k...........',
  '...........k...k................','..........k.....k...............',
  '................................','................................'],
}
PROP_PAL = {
    '.': None, 'k': (36, 24, 12), 's': (150, 162, 180), 'S': (104, 116, 136),
    'w': (226, 236, 250), 'v': (198, 160, 88), 'r': (176, 66, 54),
    'e': (110, 78, 42), 'p': (240, 148, 96), 'y': (255, 206, 79),
}


def props_sheet():
    keys = list(PROPS)
    sheet = Image.new('RGBA', (CELL * len(keys), 16))
    for i, k in enumerate(keys):
        cell = Image.new('RGBA', (CELL, 16))
        px = cell.load()
        for y, row in enumerate(PROPS[k][:16]):
            for x, ch in enumerate(row[:CELL]):
                c = PROP_PAL.get(ch)
                if c:
                    px[x, y] = c + (255,)
        sheet.paste(cell, (i * CELL, 0))
    sheet = sheet.resize((sheet.width * SCALE, sheet.height * SCALE), Image.NEAREST)
    sheet.save(os.path.join(OUT, 'props.png'))
    return keys


def write_css(els, props):
    L = ['/* generated by tools/make-farm-art.py — do not hand-edit */']
    L.append('.plant{width:32px;height:32px;background-image:url(../assets/ui/plants.png);'
             'background-size:128px auto;image-rendering:pixelated;}')
    for r, e in enumerate(els):
        for s in range(4):
            L.append(f'.plant.p-{e.lower()}.s{s}{{background-position:-{s*32}px -{r*32}px;}}')
    L.append('.plant.big{width:48px;height:48px;background-size:192px auto;}')
    for r, e in enumerate(els):
        for s in range(4):
            L.append(f'.plant.big.p-{e.lower()}.s{s}{{background-position:-{s*48}px -{r*48}px;}}')
    L.append('.prop{width:32px;height:16px;background-image:url(../assets/ui/props.png);'
             'background-size:%dpx auto;image-rendering:pixelated;display:inline-block;}' % (len(props) * 32))
    for i, k in enumerate(props):
        L.append(f'.prop.prop-{k}{{background-position:-{i*32}px 0;}}')
    open(os.path.join(ROOT, 'css', 'farm-art.css'), 'w').write('\n'.join(L) + '\n')


def main():
    soil_tile(SOIL).resize((32 * SCALE, 16 * SCALE), Image.NEAREST).save(os.path.join(OUT, 'soil.png'))
    soil_tile(WET).resize((32 * SCALE, 16 * SCALE), Image.NEAREST).save(os.path.join(OUT, 'soil-wet.png'))
    fence_strip().resize((32 * SCALE, 24 * SCALE), Image.NEAREST).save(os.path.join(OUT, 'fence.png'))
    els = plants_sheet()
    props = props_sheet()
    write_css(els, props)
    print(f'farm art: soil, soil-wet, fence, {len(els)}x4 plants, {len(props)} props')


if __name__ == '__main__':
    main()
