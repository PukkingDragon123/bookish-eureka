#!/usr/bin/env python3
"""Rebuild js/creatures-data.js from the sprites in assets/creatures.

Ids stay stable across runs (they are derived from the sprite filename), so
saved games survive a regeneration as long as a sprite keeps its name.
Types come from hue analysis, evolution lines from hand-labelled chains plus a
palette-similarity heuristic on the daily-dex sheets.
"""
import colorsys, glob, hashlib, json, os, random
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'creatures')

TYPES = ['Fire', 'Water', 'Nature', 'Electric', 'Ice', 'Earth', 'Shadow', 'Mystic', 'Metal']

S11_NAMES = ['Crewelblin', 'Nimbeetle', 'Atlandfil', 'Insetect',
             'Waid Ayed', 'Mun Ayed', 'Persnow', 'Suigenerice',
             'Chyx', 'Styrrion', 'Semaphray', 'Skuallyrojer',
             'Ayamezz', 'Suncerto', 'Elocutie', 'Emphegeist',
             'Pagespar', 'Quartzquire', 'Stalacknight']

S13 = [('Bloomoo', ['Nature'], 1), ('Borodeo', ['Nature', 'Ice'], 2), ('Bovinorth', ['Nature', 'Ice'], 3),
       ('Amphire', ['Fire', 'Shadow'], 1), ('Flamurky', ['Fire', 'Shadow'], 2), ('Infernewt', ['Fire', 'Shadow'], 3),
       ('Duover', ['Water'], 1), ('Gansoon', ['Water', 'Mystic'], 2), ('Gularass', ['Water', 'Mystic'], 3)]
S02 = [('Mossbud', ['Nature'], 1), ('Verdigrove', ['Nature'], 2), ('Eldenroot', ['Nature', 'Earth'], 3),
       ('Emberlash', ['Fire'], 1), ('Pyrewhip', ['Fire'], 2), ('Astraflare', ['Fire', 'Mystic'], 3),
       ('Dewfin', ['Water'], 1), ('Tidewyrm', ['Water'], 2), ('Maelstryke', ['Water', 'Ice'], 3)]
S17_NAMES = {0: 'Shelldon', 1: 'Bastidon', 2: 'Kindlekit', 3: 'Blazetail',
             6: 'Duskit', 7: 'Nocturnyx', 8: 'Warfang', 9: 'Frostfang',
             10: 'Sandscamp', 11: 'Emberscamp'}
S17_CHAINS = [(0, 1), (2, 3), (6, 7)]

NAME_PARTS = {
    'Fire':     (['Ember', 'Cinder', 'Pyra', 'Scorch', 'Ash', 'Flare', 'Brim', 'Magma', 'Volc', 'Kindle',
                  'Sear', 'Blaze', 'Coal', 'Fuma', 'Torch'],
                 ['fang', 'maw', 'tail', 'horn', 'ling', 'don', 'rex', 'wing', 'snout', 'mane',
                  'crest', 'brand', 'ash', 'pyre', 'char']),
    'Water':    (['Aqua', 'Tide', 'Brine', 'Coral', 'Dew', 'Wave', 'Mist', 'Squall', 'Delta', 'Puddle',
                  'Marin', 'Reef', 'Lagoo', 'Nixie', 'Kelpi'],
                 ['fin', 'gill', 'jaw', 'pod', 'ray', 'leap', 'shell', 'spout', 'drift', 'moor',
                  'surge', 'tide', 'wake', 'foam', 'dive']),
    'Nature':   (['Moss', 'Thorn', 'Sprout', 'Fern', 'Bloom', 'Verdi', 'Bramble', 'Sylva', 'Leaf', 'Grove',
                  'Petal', 'Vine', 'Seedl', 'Barka', 'Heath'],
                 ['ling', 'horn', 'paw', 'stag', 'wick', 'root', 'bud', 'crest', 'shade', 'whisk',
                  'thorn', 'briar', 'bloom', 'frond', 'sprig']),
    'Electric': (['Volt', 'Zap', 'Static', 'Arc', 'Spark', 'Jolt', 'Thunder', 'Ohm', 'Tesla', 'Fulgur',
                  'Amper', 'Surge', 'Dynam', 'Crackl', 'Flux'],
                 ['fang', 'tail', 'whisk', 'hare', 'kit', 'mane', 'claw', 'hound', 'bolt', 'wing',
                  'spark', 'coil', 'zap', 'strike', 'buzz']),
    'Ice':      (['Frost', 'Glacia', 'Snow', 'Boreal', 'Chill', 'Sleet', 'Rime', 'Cryo', 'Winter', 'Hail',
                  'Nival', 'Floe', 'Icicl', 'Perma', 'Tundr'],
                 ['fang', 'paw', 'drift', 'horn', 'maw', 'veil', 'crest', 'ling', 'howl', 'shard',
                  'frost', 'flake', 'spire', 'chill', 'glaze']),
    'Earth':    (['Terra', 'Boulder', 'Clay', 'Dune', 'Craig', 'Rubble', 'Sedi', 'Quarry', 'Loam', 'Basalt',
                  'Grani', 'Mesa', 'Stoni', 'Geode', 'Cavern'],
                 ['hide', 'back', 'snout', 'tusk', 'hoof', 'golem', 'shell', 'brute', 'maw', 'stomp',
                  'crag', 'ridge', 'mound', 'shard', 'quake']),
    'Shadow':   (['Umbra', 'Dusk', 'Grim', 'Nox', 'Wraith', 'Murk', 'Vesper', 'Hex', 'Gloom', 'Shade',
                  'Sable', 'Nether', 'Cripta', 'Mourn', 'Eclip'],
                 ['wing', 'fang', 'ghast', 'maw', 'shade', 'howl', 'gaze', 'creep', 'veil', 'claw',
                  'shroud', 'wisp', 'stalk', 'omen', 'dread']),
    'Mystic':   (['Aura', 'Fae', 'Lumen', 'Star', 'Oracle', 'Rune', 'Sera', 'Glimmer', 'Myst', 'Charm',
                  'Astra', 'Sigil', 'Lunar', 'Solst', 'Zeni'],
                 ['ling', 'wisp', 'kin', 'song', 'veil', 'gleam', 'dancer', 'bloom', 'chime', 'gaze',
                  'spell', 'grace', 'muse', 'halo', 'weave']),
    'Metal':    (['Ferro', 'Cog', 'Rivet', 'Chrome', 'Alloy', 'Gear', 'Anvil', 'Ingot', 'Bolt', 'Steel',
                  'Girder', 'Piston', 'Tunge', 'Braze', 'Clank'],
                 ['jaw', 'plate', 'core', 'fist', 'tron', 'shell', 'clank', 'guard', 'maw', 'crank',
                  'forge', 'rig', 'bolt', 'vise', 'gear']),
}

RARITY_MULT = {'common': 1, 'uncommon': 1.15, 'rare': 1.35, 'epic': 1.6, 'legendary': 2}


def seeded(s):
    return random.Random(int(hashlib.md5(s.encode()).hexdigest()[:8], 16))


def classify(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(float)
    m = a[..., 3] > 128
    px = a[m][:, :3] / 255.0
    if len(px) == 0:
        return ['Mystic'], '#a78bfa'
    if len(px) > 20000:
        px = px[::len(px) // 20000 + 1]
    counts = {t: 0 for t in TYPES}
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        H, V = h * 360, v * 255
        if s < 0.16:
            counts['Ice' if V > 205 else 'Metal' if V > 95 else 'Shadow'] += 1
            continue
        if V < 55:
            counts['Shadow'] += 1
        elif H < 15 or H >= 345:
            counts['Fire'] += 1
        elif H < 45:
            counts['Earth' if V < 150 else 'Fire'] += 1
        elif H < 68:
            counts['Electric'] += 1
        elif H < 165:
            counts['Nature'] += 1
        elif H < 200:
            counts['Ice' if (V > 200 and s < 0.45) else 'Water'] += 1
        elif H < 255:
            counts['Water'] += 1
        elif H < 292:
            counts['Shadow'] += 1
        else:
            counts['Mystic'] += 1
    order = sorted(counts.items(), key=lambda kv: -kv[1])
    total = sum(counts.values()) or 1
    types = [order[0][0]]
    if order[1][1] > 0.45 * order[0][1] and order[1][1] / total > 0.18:
        types.append(order[1][0])
    sat = px[(px.max(axis=1) - px.min(axis=1)) > 0.18]
    med = np.median(sat if len(sat) > 30 else px, axis=0)
    return types, '#%02x%02x%02x' % tuple(int(c * 255) for c in med)


def hue_hist(path):
    im = Image.open(path).convert('RGBA').resize((48, 48))
    a = np.asarray(im).astype(float)
    px = a[a[..., 3] > 128][:, :3] / 255.0
    hist = np.zeros(14)
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        hist[(12 if v > 0.55 else 13) if s < 0.16 else int(h * 12) % 12] += 1
    n = np.linalg.norm(hist)
    return hist / n if n else hist


def main():
    files = sorted(os.path.basename(p) for p in glob.glob(SRC + '/*.png'))
    entries, by_id = [], {}
    for f in files:
        stem = f[:-4]                       # sXX_YY or sXX_YYb
        sheet = stem[1:3]
        idx_part = stem[4:]
        cid = f'{sheet}_{idx_part}'
        path = os.path.join(SRC, f)
        types, color = classify(path)
        im = Image.open(path)
        e = dict(id=cid, file=f, sheet=sheet, idx=idx_part, name=None, types=types,
                 color=color, w=im.width, h=im.height, stage=1, line=None, evoTo=None,
                 rarity=None, area=int((np.asarray(im.convert('RGBA'))[..., 3] > 128).sum()))
        entries.append(e)
        by_id[cid] = e

    # hand-labelled sheets
    for i, (name, types, stage) in enumerate(S02):
        if f'02_{i:02d}' in by_id:
            by_id[f'02_{i:02d}'].update(name=name, types=types, stage=stage)
    for i, (name, types, stage) in enumerate(S13):
        if f'13_{i:02d}' in by_id:
            by_id[f'13_{i:02d}'].update(name=name, types=types, stage=stage)
    for i, name in S17_NAMES.items():
        if f'17_{i:02d}' in by_id:
            by_id[f'17_{i:02d}']['name'] = name

    s11 = sorted([e for e in entries if e['sheet'] == '11'], key=lambda e: e['id'])
    for i, e in enumerate(s11):
        if i < len(S11_NAMES):
            e['name'] = S11_NAMES[i]

    used = {n for n in (list(S11_NAMES) + [x[0] for x in S13] + [x[0] for x in S02]
                        + list(S17_NAMES.values()))}

    # evolution lines
    lines = []

    def add_line(chain):
        chain = [c for c in chain if c]
        if len(chain) < 2:
            return
        lid = f'L{len(lines):03d}'
        for st, e in enumerate(chain):
            e['line'] = lid
            e['stage'] = st + 1
            e['evoTo'] = chain[st + 1]['id'] if st + 1 < len(chain) else None
        lines.append(chain)

    for base in (0, 3, 6):
        add_line([by_id.get(f'02_{base + k:02d}') for k in range(3)])
        add_line([by_id.get(f'13_{base + k:02d}') for k in range(3)])
    for a, b in S17_CHAINS:
        add_line([by_id.get(f'17_{a:02d}'), by_id.get(f'17_{b:02d}')])

    for sheet in ('04', '05', '06', '08', '09', '12'):
        ents = sorted([e for e in entries if e['sheet'] == sheet and not e['line']],
                      key=lambda e: e['id'])
        hists = {e['id']: hue_hist(os.path.join(SRC, e['file'])) for e in ents}
        chain = ents[:1]
        for prev, cur in zip(ents, ents[1:]):
            sim = float(np.dot(hists[prev['id']], hists[cur['id']]))
            ratio = cur['area'] / max(1, prev['area'])
            if sim > 0.86 and 1.08 < ratio < 9.0 and len(chain) < 3:
                chain.append(cur)
            else:
                add_line(chain)
                chain = [cur]
        add_line(chain)

    # names for everything else
    for e in entries:
        if e['name']:
            continue
        rng = seeded('nm' + e['id'])
        pre, suf = NAME_PARTS.get(e['types'][0], NAME_PARTS['Mystic'])
        for _ in range(80):
            n = rng.choice(pre) + rng.choice(suf)
            if n not in used:
                break
        i = 2
        while n in used:
            n, i = f'{n}{i}', i + 1
        used.add(n)
        e['name'] = n

    # rarity
    areas = sorted(e['area'] for e in entries)
    for e in entries:
        rng = seeded('rar' + e['id'])
        p = areas.index(e['area']) / max(1, len(areas) - 1)
        if e['line']:
            r = ['common', 'uncommon', 'rare'][min(e['stage'] - 1, 2)]
        elif e['sheet'] == '07':
            r = 'epic'
        elif e['sheet'] in ('11', '01'):
            r = 'rare' if rng.random() < 0.7 else 'epic'
        else:
            r = 'epic' if p > 0.94 else 'rare' if p > 0.72 else 'uncommon' if p > 0.35 else 'common'
        e['rarity'] = r
    singles = sorted([e for e in entries if e['rarity'] == 'epic' and not e['line']],
                     key=lambda e: -e['area'])
    for e in singles[:8]:
        e['rarity'] = 'legendary'

    # base stats
    for e in entries:
        rng = seeded('st' + e['id'])
        rm = RARITY_MULT[e['rarity']] * [1.0, 1.45, 2.05][min(e['stage'] - 1, 2)]
        j = lambda: 0.88 + rng.random() * 0.24
        e['base'] = dict(hp=int(46 * rm * j()), atk=int(11 * rm * j()),
                         de=int(7 * rm * j()), spd=int(9 * rm * j()))

    out = [{k: e[k] for k in ('id', 'file', 'name', 'types', 'stage', 'line',
                              'evoTo', 'rarity', 'base', 'color', 'w', 'h')}
           for e in entries]
    with open(os.path.join(ROOT, 'js', 'creatures-data.js'), 'w') as fh:
        fh.write('window.CREATURES = ' + json.dumps(out, separators=(',', ':')) + ';\n')

    from collections import Counter
    print(f'{len(out)} creatures, {len(lines)} evolution lines')
    print('rarity:', dict(Counter(e['rarity'] for e in entries)))
    print('types:', dict(Counter(t for e in entries for t in e['types'])))


if __name__ == '__main__':
    main()
