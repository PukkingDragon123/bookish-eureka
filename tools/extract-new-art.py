#!/usr/bin/env python3
"""Cut the uploaded art sheets into game-ready spritesheets.

v2 pipeline — every icon is cut ONE BY ONE, content-aware:

  * The whole sheet is keyed at once. Bright-key sheets (magenta / pink)
    get true chroma-key alpha unmixing with despill, so anti-aliased edges
    keep a soft 8-bit alpha and zero key-colour fringe. Dark painterly
    sheets are flood-filled from the border with a tolerance measured
    from the sheet's own border noise, so black outlines survive.
  * NO grid division anywhere. The sheet is segmented by its own
    projection profiles, so every boundary sits in genuine whitespace,
    and each icon's extents come from its own pixels (all its blobs,
    sparkles included) — art can never be cut flat or go missing.
  * Cells stay big (128px) all the way through; resizing is premultiplied
    LANCZOS, alpha is never binarised, colours are never snapped.

Outputs: gear / plants / crops / hobby / ui-icons / elements / skills /
moves spritesheets + their CSS and JS data files.
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
    # the magic wheel: a proper runed circle with a glowing core, from the
    # Mystic move sheet. The old ceremonial-disc icon read as a flat plate.
    'portal':  ('moves/Mystic_Attack_Moves.png', 5, 2, 1),   # Rune Burst wheel
    'skull':   ('8BE17875-FC46-4DC8-ACAB-48F4C582B28D.png', 5, 2, 9),   # skull
    'gold':    (CURRENCY[0], 4, 1, 0),     # coin
    'gem':     (CURRENCY[0], 4, 1, 1),     # crystal
    'relic':   (CURRENCY[0], 4, 1, 2),     # rune egg
    'streak':  (CURRENCY[0], 4, 1, 3),     # flame
    'bolt':    (CURRENCY[0], 4, 1, 3),     # flame doubles for the x3 boost
    # aliases for icon keys quests/habits use, mapped onto uploaded art
    'water':   ('ADA4A098-562C-4C7B-A043-22FFEAEAB879.png', 3, 3, 1),  # water element
    'muscle':  ('E5DB9555-D516-4E31-BBFA-6E3449678D48.png', 5, 2, 8),  # dumbbell
    'walk':    ('E5DB9555-D516-4E31-BBFA-6E3449678D48.png', 5, 2, 5),  # running shoe
    'cook':    ('E5DB9555-D516-4E31-BBFA-6E3449678D48.png', 5, 2, 3),  # chef hat
    'palette': ('E5DB9555-D516-4E31-BBFA-6E3449678D48.png', 5, 2, 1),  # paint palette
    'sunrise': ('E5DB9555-D516-4E31-BBFA-6E3449678D48.png', 5, 2, 9),  # meditation
    'timer':   (UTIL_SHEET[0], 3, 3, 2),                               # play = start
    'star':    ('moves/Mystic_Attack_Moves.png', 5, 2, 2),  # starfall
    'paw':     (CURRENCY[0], 4, 1, 2),                                 # rune egg
}

# ---- element icons: 3x3, exactly the nine types the game uses ----
ELEM_SHEET = ('ADA4A098-562C-4C7B-A043-22FFEAEAB879.png', 3, 3)
ELEM_ORDER = ['Fire', 'Water', 'Nature', 'Electric', 'Ice', 'Earth',
              'Shadow', 'Mystic', 'Metal']

# ---- spell icons: two 6x5 sheets, grouped by element ----
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

# ---- attack-move icons: one 5x2 sheet per element, names from the manifest ----
MOVES_DIR = 'moves'
MOVE_NAMES = {
 'Fire': ['Fireball Shot','Flame Blade Slash','Ember Meteor','Burning Wave','Magma Burst',
          'Flame Ring Trap','Solar Beam','Firework Volley','Cinder Mine','Inferno Spiral'],
 'Water': ['Water Blade','Tidal Crash','Bubble Bomb','Whirlpool Trap','Water Cannon',
           'Geyser Burst','Rain Spear Volley','Wave Ring','Splash Dash','Deep-Current Beam'],
 'Nature': ['Thorn Lash','Vine Snare','Seed Shot Volley','Leaf Blade','Pollen Burst',
            'Spore Cloud','Root Quake','Bramble Cutter','Forest Cyclone','Fruit Bomb'],
 'Electric': ['Lightning Bolt','Chain Shock','Thunder Ring','Spark Mine','Plasma Orb',
              'Electric Net','Storm Beam','Voltage Burst','Speed Dash Bolt','Thundercloud Strike'],
 'Ice': ['Ice Shard Shot','Frost Wave','Icicle Rain','Freeze Trap','Glacier Spike',
         'Hail Barrage','Crystal Lance','Frozen Orb','Ice Ring','Blizzard Burst'],
 'Earth': ['Rock Throw','Boulder Drop','Stone Spike','Quake Ring','Sand Blast',
           'Mud Trap','Rock Hammer Impact','Earth Wall Crush','Gravel Volley','Mountain Burst'],
 'Shadow': ['Shadow Blade','Void Orb','Dark Wave','Eclipse Beam','Curse Sigil',
            'Smoke Burst','Shadow Chain','Black-Hole Pull','Night Spike','Silence Seal'],
 'Mystic': ['Arcane Bolt','Rune Burst','Starfall','Portal Strike','Dream Wave',
            'Tarot Slash','Cosmic Spiral','Astral Orb','Magic Circle Blast','Fate Needle Volley'],
 'Metal': ['Steel Blade Slash','Gear Saw','Metal Shard Volley','Magnetic Pulse','Chain Hook Strike',
           'Iron Cannon Shot','Drill Burst','Metal Storm','Gear Trap','Anvil Drop'],
}

CELL = 128          # packed cell size — kept big so nothing is crushed


# ---------------------------------------------------------------- keying
def _bg_of(a):
    """Median colour of a 3px border ring."""
    ring = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                           a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    return np.median(ring, axis=0)


def key_sheet(img):
    """Key a WHOLE sheet -> RGBA with soft alpha and despilled rgb.

    The tolerance is MEASURED from the sheet's own border ring rather than
    guessed. These sheets have near-perfect flat backgrounds (ring spread
    <= ~11), while a pure-black outline pixel sits 54-71 away from a navy
    background — so a fixed generous threshold silently classified every
    black outline as background and flood-filled it away. That is what ate
    the gem's outline (and every outline on every dark sheet).

    Bright keys (magenta / pink) additionally get alpha unmixing and
    despill, so anti-aliased edges keep a soft alpha and no key fringe.
    """
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    h, w = a.shape[:2]
    bg = _bg_of(a)

    # how noisy is the background itself? tolerance follows from that.
    ring = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                           a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    noise = float(np.percentile(np.abs(ring - bg).sum(1), 99.5))
    d = np.abs(a - bg).sum(2)
    bright_key = (bg.max() - bg.min()) > 70 and bg.max() > 150

    if bright_key:
        # soft chroma ramp; t0 clears bg noise by a wide margin but stays
        # far below any real art colour on a saturated key
        t0 = max(40.0, noise * 3)
        t1 = max(t0 + 90.0, 200.0)
        alpha = np.clip((d - t0) / (t1 - t0), 0, 1)
        mix = (alpha > 0) & (alpha < 1)
        if mix.any():
            am = alpha[mix][:, None]
            a[mix] = np.clip((a[mix] - (1 - am) * bg) / np.maximum(am, 1e-3), 0, 255)
        spill = (alpha >= 1) & (d < 340)
        if bg[0] > 150 and bg[2] > 100 and bg[1] < 120:      # magenta / pink family
            r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]
            spill &= (r_ > g_ + 60) & (b_ > g_ + 30)
            a[spill, 0] = np.minimum(r_[spill], g_[spill] + 60)
            a[spill, 2] = np.minimum(b_[spill], g_[spill] + 60)
    else:
        # dark flat background: tight tolerance so black outlines survive,
        # then flood fill from the border to take enclosed bg pockets too
        tol = min(max(16.0, noise * 2.2), 34.0)
        near = d < tol
        lab, n = ndimage.label(near)
        keep = np.ones((h, w), bool)
        if n:
            border = set(lab[0].tolist()) | set(lab[-1].tolist()) | \
                set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
            border.discard(0)
            sizes = ndimage.sum(near, lab, range(1, n + 1))
            drop = [i + 1 for i in range(n)
                    if (i + 1) in border or sizes[i] > 0.002 * h * w]
            if drop:
                keep = ~np.isin(lab, drop)
        # anti-alias the cut by one pixel instead of a hard stair-step
        soft = ndimage.uniform_filter(keep.astype(np.float64), 3)
        alpha = np.where(keep, 1.0, np.clip(soft * 1.4 - 0.25, 0, 1))

    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)
    return rgba


def _bands(profile, n_want, min_gap):
    """Content bands from a projection profile, reconciled to n_want.

    Boundaries land in genuine empty space, so an icon is never cut. If the
    profile yields too many bands the closest neighbours are merged; too
    few and the widest band is split at its quietest interior column.
    """
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
            out.append([i, min(j, n)])
            i = j
        else:
            i += 1
    if not out:
        return [[0, n]]

    while len(out) > n_want:                     # merge the tightest gap
        gaps = [(out[i + 1][0] - out[i][1], i) for i in range(len(out) - 1)]
        _, i = min(gaps)
        out[i] = [out[i][0], out[i + 1][1]]
        del out[i + 1]
    while len(out) < n_want:                     # split the widest band
        i = max(range(len(out)), key=lambda i: out[i][1] - out[i][0])
        s, e = out[i]
        mid = s + (e - s) // 4
        seg = profile[s + (e - s) // 4: e - (e - s) // 4]
        if len(seg) == 0:
            break
        cut = mid + int(np.argmin(seg))
        out[i] = [s, cut]
        out.insert(i + 1, [cut, e])
    return out


def sheet_cells(path, cols, rows, min_px=None):
    """Cut every icon out of a sheet ONE BY ONE — no grid division.

    The sheet is keyed, then split by its own projection profiles: rows are
    found from the horizontal profile, and each row's columns are found from
    that row's own vertical profile (so a row that drifts or has wider art
    is segmented on its own terms). Every boundary sits in real whitespace,
    which is why nothing clips and nothing goes missing.
    """
    img = Image.open(os.path.join(SRC, path))
    rgba = key_sheet(img)
    h, w = rgba.shape[:2]
    solid = rgba[..., 3] > 100
    if min_px is None:
        min_px = max(6, int(0.000004 * h * w))

    # drop isolated key-noise specks, and "webs": faint sub-threshold halo
    # pixels can form one sparse structure spanning the entire sheet, which
    # would otherwise swallow whichever region its centroid landed in.
    lab, n = ndimage.label(solid, structure=np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        junk = []
        for i, sl in enumerate(ndimage.find_objects(lab)):
            bh, bw = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            spans = max(bh / h, bw / w) > 0.45
            if sizes[i] < min_px or (spans and sizes[i] < 0.12 * bh * bw):
                junk.append(i + 1)
        if junk:
            solid = solid & ~np.isin(lab, junk)

    # relabel the cleaned mask, and note where each blob's centre of mass is
    lab, n = ndimage.label(solid, structure=np.ones((3, 3)))
    coms = ndimage.center_of_mass(solid, lab, range(1, n + 1)) if n else []

    rb = _bands(solid.sum(1), rows, max(3, int(0.004 * h)))
    out = [[Image.new('RGBA', (8, 8)) for _ in range(cols)] for _ in range(rows)]
    for r, (y0, y1) in enumerate(rb):
        strip = solid[y0:y1]
        cb = _bands(strip.sum(0), cols, max(3, int(0.004 * w)))
        for c, (x0, x1) in enumerate(cb):
            # every blob whose centre falls in this region belongs to this icon
            ids = [i + 1 for i, (cy, cx) in enumerate(coms)
                   if y0 <= cy < y1 and x0 <= cx < x1]
            if not ids:
                continue
            msk = np.isin(lab, ids)
            # grow slightly to re-include the soft anti-aliased rim
            grown = ndimage.binary_dilation(msk, np.ones((3, 3), bool), iterations=2)
            ys, xs = np.where(grown)
            # extents come from the ART, not from the region -> never clipped
            piece = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
            sub = grown[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            piece[..., 3] = np.where(sub, piece[..., 3], 0)
            out[r][c] = strip_plate(Image.fromarray(piece, 'RGBA'))
    return out


# ---------------------------------------------------------------- fitting
def strip_plate(im):
    """Remove a flat colour plate baked around a single icon.

    Some sheets give each icon its own tile whose colour differs slightly
    from the sheet's outer border, so a tolerance tight enough to protect
    black outlines leaves the tile behind — the magic-circle, skull and
    chest icons all shipped sitting on a dark navy square. Re-key the cut
    against its OWN border colour, border-connected only.
    """
    a = np.asarray(im.convert('RGBA')).astype(np.float64)
    if a.shape[0] < 6 or a.shape[1] < 6:
        return im
    al = a[..., 3]
    if (al > 60).mean() < 0.55:            # already a clean cutout
        return im
    rgb = a[..., :3]
    # sample two pixels in: the trimmed edge itself is transparent
    k = 2
    ring = np.concatenate([rgb[k], rgb[-1 - k], rgb[:, k], rgb[:, -1 - k]])
    ringa = np.concatenate([al[k], al[-1 - k], al[:, k], al[:, -1 - k]])
    ring = ring[ringa > 60]
    if len(ring) < 8:
        return im
    bg = np.median(ring, axis=0)
    if np.abs(ring - bg).sum(1).mean() > 26:   # border is not one flat colour
        return im
    near = (np.abs(rgb - bg).sum(2) < 40) & (al > 0)
    lab, n = ndimage.label(near)
    if not n:
        return im
    sizes = ndimage.sum(near, lab, range(1, n + 1))
    total = a.shape[0] * a.shape[1]
    # the plate is the dominant flat-colour region; an icon's own details are
    # never one flat colour spanning this much of the cut
    ids = [i + 1 for i in range(n) if sizes[i] > 0.15 * total]
    if not ids:
        return im
    plate = np.isin(lab, ids)
    if plate.mean() < 0.10:
        return im
    out = a.copy()
    out[plate, 3] = 0
    im = Image.fromarray(out.astype(np.uint8), 'RGBA')
    bb = im.split()[3].getbbox()
    return im.crop(bb) if bb else im


def fit(im, size, k=None, anchor='center', pad=4):
    """Fit into a size x size box with premultiplied LANCZOS — soft alpha
    survives, no colour snapping, no jaggies. Pass k for a shared scale
    (growth stages keep their relative sizes)."""
    if im.width < 2 or im.height < 2:
        return Image.new('RGBA', (size, size))
    if k is None:
        k = min((size - pad) / im.width, (size - pad) / im.height)
    nw = max(1, min(size, round(im.width * k)))
    nh = max(1, min(size, round(im.height * k)))
    a = np.asarray(im).astype(np.float64)
    al = a[..., 3:] / 255.0
    pre = np.dstack([a[..., :3] * al, a[..., 3:]])
    pre = np.asarray(Image.fromarray(pre.astype(np.uint8), 'RGBA')
                     .resize((nw, nh), Image.LANCZOS)).astype(np.float64)
    al2 = np.maximum(pre[..., 3:], 1e-3)
    rgb = np.clip(pre[..., :3] / (al2 / 255.0) * 1.0, 0, 255)
    outp = np.dstack([rgb, pre[..., 3:]]).astype(np.uint8)
    im = Image.fromarray(outp, 'RGBA')
    canvas = Image.new('RGBA', (size, size))
    y = size - im.height - 1 if anchor == 'bottom' else (size - im.height) // 2
    canvas.paste(im, ((size - im.width) // 2, max(0, y)))
    return canvas


def group_scale(cuts, size, pad=4):
    big = max(max(c.width, c.height) for c in cuts)
    return (size - pad) / big


# ---------------------------------------------------------------- sheet build
def pack(cells, cols, size, path, colours=255):
    """Pack into an RGBA-palette sheet. Alpha is posterized to 16 levels
    (visually identical at icon sizes) so the octree palette holds smooth
    edges AND rich colour while compressing ~4x smaller than raw RGBA."""
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * size, rows * size))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * size, (i // cols) * size))
    a = np.asarray(sheet).copy()
    a[..., 3] = (a[..., 3] // 16) * 17
    q = Image.fromarray(a, 'RGBA').quantize(colors=colours, method=Image.FASTOCTREE)
    q.save(os.path.join(OUT, path), optimize=True)


def sheet_css(header, cls, png, cols, rows, base_px, entries, sizes=(), valign=0.22):
    """Scale-invariant sprite CSS: percentage positions, so any width/height
    override still crops the right cell. Icons are smooth-scaled (the packed
    cells are 128px, always bigger than display size — pixelated rendering
    at a downscale is what mangled them before)."""
    out = [header]
    grp = ','.join(f'{cls}{sfx}' for sfx, _, _ in entries)
    out.append(f'{grp}{{display:inline-block;flex:none;'
               f'width:{base_px}px;height:{base_px}px;'
               f'background-image:url(../assets/ui/{png});'
               f'background-size:{cols * 100}% {rows * 100}%;'
               f'vertical-align:-{round(base_px * valign)}px;}}')
    for sfx, c, r in entries:
        x = 0 if cols == 1 else round(c / (cols - 1) * 10000) / 100
        y = 0 if rows == 1 else round(r / (rows - 1) * 10000) / 100
        out.append(f'{cls}{sfx}{{background-position:{x}% {y}%;}}')
    for extra, px in sizes:
        out.append(f'{cls}{extra}{{width:{px}px;height:{px}px;'
                   f'vertical-align:-{round(px * valign)}px;}}')
    return out


def main():
    P = CELL

    # ---- gear: 6 categories x 9 tiers ----
    gear = []
    for path, key, _ in GEAR_SHEETS:
        g = sheet_cells(path, 4, 5)
        flat = [g[r][c] for r in range(5) for c in range(4)]
        for t in TIER_PICK:
            gear.append(fit(flat[t], P))
    pack(gear, 9, P, 'gear.png')
    css = ['/* generated by tools/extract-new-art.py — do not hand-edit */']
    css += sheet_css('/* gear: 6 categories x 9 tiers */', '.gear', 'gear.png', 9, len(GEAR_SHEETS), 34,
                     [(f'.g-{key}.t{t + 1}', t, gi) for gi, (_, key, _) in enumerate(GEAR_SHEETS)
                      for t in range(9)],
                     sizes=[('.big', 48)])

    # ---- plants: 9 elements x 4 stages, plus the harvested crop items ----
    cache = {}
    plants, crops = [], []
    for e in ELEMENTS:
        path, col = CROP_COL[e]
        if path not in cache:
            cache[path] = sheet_cells(path, 5, 5)
        g = cache[path]
        cuts = [g[r][col] for r in STAGE_ROWS]
        k = group_scale(cuts, P)
        for c in cuts:
            plants.append(fit(c, P, k=k, anchor='bottom'))
        crops.append(fit(g[3][col], P))
    pack(plants, 4, P, 'plants.png')
    pack(crops, 9, P, 'crops.png')
    css += sheet_css('/* plants: 9 elements x 4 growth stages */', '.plant', 'plants.png', 4, 9, 32,
                     [(f'.p-{e.lower()}.s{st}', st, ei) for ei, e in enumerate(ELEMENTS)
                      for st in range(4)],
                     sizes=[('.big', 48), ('.huge', 56)])
    css += sheet_css('/* harvested crops */', '.crop', 'crops.png', 9, 1, 26,
                     [(f'.c-{e.lower()}', ei, 0) for ei, e in enumerate(ELEMENTS)],
                     sizes=[('.big', 40)])

    # ---- the UI icon set, entirely from uploaded art ----
    ui_keys, ui_cells = [], []
    gcache = {}
    for key, (fname, cols, rows_n, idx) in UI_ICONS.items():
        ck = (fname, cols, rows_n)
        if ck not in gcache:
            gcache[ck] = sheet_cells(fname, cols, rows_n)
        g = gcache[ck]
        ui_cells.append(fit(g[idx // cols][idx % cols], P))
        ui_keys.append(key)
    UICOLS = 8
    urows = (len(ui_keys) + UICOLS - 1) // UICOLS
    pack(ui_cells, UICOLS, P, 'ui-icons.png')
    icss = ['/* generated by tools/extract-new-art.py from the uploaded sheets.',
            '   Every cell is user-supplied art — the build draws no icons itself. */',
            '.ico{display:none;}']
    icss += sheet_css('/* named ui icons */', '.ico', 'ui-icons.png', UICOLS, urows, 24,
                      [(f'.ico-{k}', i % UICOLS, i // UICOLS) for i, k in enumerate(ui_keys)],
                      sizes=[('.big', 34), ('.huge', 48)])
    open(os.path.join(ROOT, 'css', 'ui-icons.css'), 'w').write('\n'.join(icss) + '\n')
    print(f'ui-icons  {len(ui_keys)} icons: {" ".join(ui_keys)}')

    # ---- element icons ----
    eg = gcache.get((ELEM_SHEET[0], 3, 3)) or sheet_cells(ELEM_SHEET[0], 3, 3)
    ecells = [fit(eg[i // 3][i % 3], P) for i in range(9)]
    pack(ecells, 9, P, 'elements.png')
    ecss = sheet_css('/* the 9 element icons */', '.elem', 'elements.png', 9, 1, 24,
                     [(f'.el-{e.lower()}', i, 0) for i, e in enumerate(ELEM_ORDER)],
                     sizes=[('.big', 32), ('.huge', 46)])
    open(os.path.join(ROOT, 'css', 'elements.css'), 'w').write('\n'.join(ecss) + '\n')
    print('elements  9 icons')

    # ---- spell icons, packed element-major ----
    spells, by_elem = [], {}
    for (sheet, cols, rows_n), elems in ((SPELL_A, SPELL_A_ELEMS), (SPELL_B, SPELL_B_ELEMS)):
        g = sheet_cells(sheet, cols, rows_n)
        for i, e in enumerate(elems):
            by_elem.setdefault(e, []).append(fit(g[i // cols][i % cols], P))
    order = []
    for e in ELEM_ORDER + ['Ultimate']:
        for cell in by_elem.get(e, []):
            spells.append(cell); order.append(e)
    SCOLS = 8
    srows = (len(spells) + SCOLS - 1) // SCOLS
    pack(spells, SCOLS, P, 'skills.png')
    scss = sheet_css('/* spell icons */', '.spell', 'skills.png', SCOLS, srows, 34,
                     [(f'.sp-{i}', i % SCOLS, i // SCOLS) for i in range(len(spells))],
                     sizes=[('.big', 44), ('.huge', 56)])
    open(os.path.join(ROOT, 'css', 'skills.css'), 'w').write('\n'.join(scss) + '\n')
    ranges = {}
    for i, e in enumerate(order):
        ranges.setdefault(e, []).append(i)
    open(os.path.join(ROOT, 'js', 'skill-icons.js'), 'w').write(
        '/* generated by tools/extract-new-art.py */\nwindow.SKILL_ICONS = '
        + json.dumps(ranges) + ';\n')
    print('skills    ' + ' '.join(f'{e}:{len(v)}' for e, v in ranges.items()))

    # ---- attack moves: 10 per element, names from the manifest ----
    mv_cells, mv_meta = [], {}
    for ei, e in enumerate(ELEM_ORDER):
        g = sheet_cells(os.path.join(MOVES_DIR, f'{e}_Attack_Moves.png'), 5, 2)
        for i in range(10):
            mv_cells.append(fit(g[i // 5][i % 5], P))
        mv_meta[e] = {'row': ei, 'names': MOVE_NAMES[e]}
    pack(mv_cells, 10, P, 'moves.png')
    mcss = sheet_css('/* attack-move icons: 10 per element */', '.move', 'moves.png', 10, 9, 34,
                     [(f'.mv-{ei}-{i}', i, ei) for ei in range(9) for i in range(10)],
                     sizes=[('.big', 44), ('.huge', 56)])
    open(os.path.join(ROOT, 'css', 'moves.css'), 'w').write('\n'.join(mcss) + '\n')
    open(os.path.join(ROOT, 'js', 'move-data.js'), 'w').write(
        '/* generated by tools/extract-new-art.py — names from the uploaded manifest */\n'
        'window.MOVE_DATA = ' + json.dumps(mv_meta) + ';\n')
    print(f'moves     {len(mv_cells)} icons, 10 per element')

    # ---- the mentor NPC ----
    npc = Image.open(os.path.join(SRC, 'npc-mentor.png')).convert('RGBA')
    arr = np.asarray(npc)
    if (arr[..., 3] < 250).mean() < 0.02:            # no real alpha -> key it
        npc = Image.fromarray(key_sheet(npc), 'RGBA')
        bb = npc.split()[3].getbbox()
        if bb:
            npc = npc.crop(bb)
    npc = fit(npc, 192)
    npc.save(os.path.join(OUT, 'npc.png'))
    print('npc       mentor sprite 192px')

    # ---- hobby / activity icons ----
    hob, names = [], []
    for path, keys in HOBBY_SHEETS:
        g = sheet_cells(path, 5, 2)
        for r in range(2):
            for c in range(5):
                hob.append(fit(g[r][c], P))
                names.append(keys[r * 5 + c])
    cpath, ckeys = CURRENCY
    g = sheet_cells(cpath, 4, 1)
    for c in range(4):
        hob.append(fit(g[0][c], P))
        names.append(ckeys[c])
    HCOLS = 8
    hrows = (len(hob) + HCOLS - 1) // HCOLS
    pack(hob, HCOLS, P, 'hobby.png')
    css += sheet_css('/* hobby icons */', '.hob', 'hobby.png', HCOLS, hrows, 26,
                     [(f'.h-{n}', i % HCOLS, i // HCOLS) for i, n in enumerate(names)],
                     sizes=[('.big', 36), ('.huge', 48)])

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
