#!/usr/bin/env python3
"""Draw the UI pixel art: an icon spritesheet and 9-slice panel frames.

Icons are hand-authored 16x16 pixel maps (one character per pixel, keyed to a
small palette per icon) packed into a single sheet, with generated CSS classes.
Frames are drawn procedurally with hard pixel edges — no anti-aliasing anywhere.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ui')
os.makedirs(OUT, exist_ok=True)

S = 16          # icon size
SCALE = 2       # sheet is drawn at 2x so it stays crisp on hidpi

# palette letters shared by all icons
P = {
    '.': None,
    'k': (26, 20, 38),        # outline
    'w': (255, 255, 255),
    'W': (222, 226, 245),
    'y': (255, 212, 77),      # gold
    'Y': (255, 158, 46),
    'o': (196, 106, 22),
    'c': (107, 226, 255),     # gem cyan
    'C': (42, 150, 208),
    'm': (176, 125, 255),     # mana violet
    'M': (110, 62, 200),
    'g': (125, 255, 200),     # essence mint
    'G': (52, 176, 136),
    'r': (255, 93, 108),      # hp red
    'R': (190, 40, 70),
    'f': (255, 138, 46),      # flame
    'F': (255, 92, 32),
    'b': (66, 166, 245),      # water blue
    'B': (30, 96, 180),
    'n': (108, 200, 92),      # nature green
    'N': (48, 128, 60),
    's': (150, 162, 190),     # steel
    'S': (96, 108, 138),
    'p': (244, 143, 177),     # pink
    'e': (120, 90, 60),       # earth brown
    'E': (78, 56, 36),
    'v': (250, 240, 190),     # parchment
    'd': (60, 52, 92),        # deep shade
}

ICONS = {
 'gold': [
  '................','......kkkk......','....kkyyyykk....','...kyyYYYYyyk...',
  '..kyyYyyyyYYyk..','..kyYyyowwoyYyk.','.kyYyyowwwwoyYk.','.kyYyoww..wwoyk.',
  '.kyYyoww..wwoyk.','.kyYyyowwwwoyYk.','..kyYyyowwoyYyk.','..kyyYyyyyYYyk..',
  '...kyyYYYYyyk...','....kkyyyykk....','......kkkk......','................'],
 'gem': [
  '................','.....kkkkkk.....','....kccwwcck....','...kcwwccwwck...',
  '..kccwcccccwck..','.kcwcccccccccwk.','.kccccccccccck..','..kCcccccccCk...',
  '...kCCcccCCk....','....kCCcCCk.....','.....kCCCk......','......kCk.......',
  '.......k........','................','................','................'],
 'mana': [
  '................','......kkkk......','....kkmmmmkk....','...kmmwwwmmmk...',
  '..kmmwwmmmmmmk..','.kmmwmmmmmmmmk..','.kmmmmmmmmmmMk..','.kmmmmmmmmmMMk..',
  '.kmmmmmmmmmMMk..','.kMmmmmmmmMMMk..','..kMMmmmmMMMk...','...kMMMMMMMk....',
  '....kkMMMkk.....','......kkk.......','................','................'],
 'essence': [
  '................','.......k........','.......gk.......','......gwgk......',
  '..k...gwwgk...k.','..gk.gwwwwg..gk.','...ggwwwwwwggk..','..kgwwwwwwwwgk..',
  '...ggwwwwwwggk..','..gk.gwwwwg..gk.','..k...gwwgk...k.','.......gwgk.....',
  '.......ggk......','.......kk.......','................','................'],
 'streak': [
  '................','.......k........','......kfk.......','......kffk......',
  '.....kfffk......','....kffFffk.....','...kffFFFffk....','..kfffFFFfffk...',
  '..kffFFyyFFffk..','.kffFFyyyyFFffk.','.kffFyywwyyFffk.','.kffFyywwyyFffk.',
  '..kffFyyyyFffk..','..kfffFFFFfffk..','...kkffffffkk...','.....kkkkkk.....'],
 'hp': [
  '................','..kkk....kkk....','.krrrk..krrrk...','krwwrrkkrrrrrk..',
  'krwrrrrrrrrrrrk.','krrrrrrrrrrrrrk.','.krrrrrrrrrrrk..','.kRrrrrrrrrrRk..',
  '..kRrrrrrrrrRk..','...kRrrrrrrRk...','....kRrrrrRk....','.....kRrrRk.....',
  '......kRrRk.....','.......kRk......','........k.......','................'],
 'sword': [
  '................','............kk..','...........kWWk.','..........kWwWk.',
  '.........kWwWWk.','........kWwWWk..','.......kWwWWk...','......kWwWWk....',
  '..k..kWwWWk.....','.kSk.kWWWk......','.kSSkkWWk.......','..kSSkWk........',
  '.kSSSSkk........','.kSSSSSk........','..kkSSk.........','....kk..........'],
 'shield': [
  '................','...kkkkkkkkk....','..kssswwwsssk...','..ksswwwwwssk...',
  '..ksswwsswwssk..','..kssswwwsssk...','..kssswwwsssk...','..kSsssssssSk...',
  '...kSsssssSk....','...kSSsssSSk....','....kSSsSSk.....','.....kSSSk......',
  '......kSk.......','................','................','................'],
 'paw': [
  '................','...kk.kkkk.kk...','..keek.keek.kk..','..keek.keek.ek..',
  '..keek.keek.ek..','...kk...kk..kk..','................','....kkkkkkkk....',
  '...keeeeeeeeek..','..keeeeeeeeeeek.','..keeeeeeeeeeek.','..keeeeeeeeeeek.',
  '...keeeeeeeeek..','....keeeeeeek...','.....kkkkkkk....','................'],
 'water': [
  '................','.......k........','.......bk.......','......kbbk......',
  '......kbbbk.....','.....kbwbbbk....','....kbwwbbbbk...','...kbwwbbbbbk...',
  '..kbwwbbbbbbbk..','..kbwbbbbbbbBk..','..kbbbbbbbbBBk..','..kBbbbbbbBBBk..',
  '...kBBbbbBBBk...','....kBBBBBBk....','.....kkkkkk.....','................'],
 'meal': [
  '................','.......nn.......','......nNn.......','.....knnk.......',
  '...kkrrrrkk.....','..krrwrrrrrk....','.krrwwrrrrrrk...','.krwwrrrrrrrk...',
  '.krwrrrrrrrrk...','.krrrrrrrrrrk...','.kRrrrrrrrrRk...','..kRrrrrrrRk....',
  '...kRRrrRRk.....','....kkkkkk......','................','................'],
 'cook': [
  '................','................','...kkkkkkkk.....','..kssssssssk....',
  '..ksfffffssk....','..ksffFffsskkkkk','..ksfffffssseeek','..kssssssssk.kkk',
  '...kkkkkkkk.....','................','..k..k..k..k....','..k..k..k..k....',
  '.................','................','................','................'],
 'walk': [
  '................','......kkk.......','.....kvvvk......','.....kvwvk......',
  '......kvk.......','....kkkkkk......','...kbbbbbbk.....','..kbbkbbkbbk....',
  '..kbk.kbk.kbk...','..kk..kbk..kk...','......kbk.......','.....kbbk.......',
  '....kbbk.kbk....','...kbbk..kbbk...','..kEEk....kEEk..','..kkk......kkk..'],
 'muscle': [
  '................','................','................','..kk........kk..',
  '.kssk......kssk.','.kswk......kswk.','kssskkkkkkksssk.','kswskssssskkswk.',
  'kswskssssskkswk.','kssskkkkkkksssk.','.kswk......kswk.','.kssk......kssk.',
  '..kk........kk..','................','................','................'],
 'palette': [
  '................','.....kkkkk......','...kkvvvvvkk....','..kvvvrvvvvvk...',
  '.kvvrvvvvbvvvk..','.kvvvvvvvvvvvk..','kvvbvvvvvvvnvk..','kvvvvvkkkvvvvk..',
  'kvvvvkyyykvvvk..','kvvvvkyyyk.kvk..','.kvvvvkkk.......','.kvvvvvvk.......',
  '..kvvvvvk.......','...kkkkk........','................','................'],
 'sunrise': [
  '................','.......k........','.......y........','..k....y....k...',
  '...y...y...y....','....k..y..k.....','.....kyyyyk.....','....kyyyyyyk....',
  'y.y.kyyYYYYyk.y.','...kyyYYYYYYyk..','...kyyYYYYYYyk..','...kyyyYYYyyyk..',
  '.kkkkkkkkkkkkkk.','................','..bbbb....bbbb..','................'],
 'timer': [
  '................','..kkkkkkkkkk....','..ksssssssssk...','...kvvvvvvvk....',
  '....kvvyvvk.....','.....kvyvk......','......kyk.......','......kyk.......',
  '.....kvyvk......','....kvyyyvk.....','...kvyyyyyvk....','..kvyyyyyyyk....',
  '..ksssssssssk...','..kkkkkkkkkk....','................','................'],
 'scroll': [
  '................','..kkkkkkkkkkk...','.keeeeeeeeeeek..','.kevvvvvvvvvek..',
  '.kevkkkkkkkvek..','.kevvvvvvvvvek..','.kevkkkkkkvvek..','.kevvvvvvvvvek..',
  '.kevkkkkkkkvek..','.kevvvvvvvvvek..','.kevkkkkkvvvek..','.kevvvvvvvvvek..',
  '.keeeeeeeeeeek..','..kkkkkkkkkkk...','................','................'],
 'relic': [
  '................','......kkk.......','.....kyyyk......','....kyyYyyk.....',
  '....kyYcccYk....','...kyYccccYyk...','...kyYccccYyk...','....kyYcccYk....',
  '....kyyYyyk.....','.....kyyyk......','......kkk.......','................',
  '................','................','................','................'],
 'star': [
  '................','.......k........','......kyk.......','......kyk.......',
  '.....kyyyk......','.kkkkkyyykkkkk..','.kyyyyyyyyyyyk..','..kyyyyyyyyyk...',
  '...kyyyyyyyk....','....kyyyyyk.....','...kyyYkYyyk....','..kyyYk.kYyyk...',
  '.kyYYk...kYYyk..','.kkk.......kkk..','................','................'],
 'lock': [
  '................','.....kkkkkk.....','....kssssssk....','...kssk..kssk...',
  '...kssk..kssk...','...kssk..kssk...','..kkkkkkkkkkkk..','..kyyyyyyyyyyk..',
  '..kyyyyyyyyyyk..','..kyyyykkyyyyk..','..kyyyk..kyyyk..','..kyyyykkyyyyk..',
  '..kyyyyyyyyyyk..','..kkkkkkkkkkkk..','................','................'],
 'check': [
  '................','................','.............kk.','............kgk.',
  '...........kggk.','.kk.......kggk..','.kgk.....kggk...','.kggk...kggk....',
  '..kggk.kggk.....','...kggkggk......','....kgggk.......','.....kgk........',
  '......k.........','................','................','................'],
 'plus': [
  '................','................','......kkk.......','......kgk.......',
  '......kgk.......','..kkkkkgkkkkk...','..kgggggggggk...','..kgggggggggk...',
  '..kkkkkgkkkkk...','......kgk.......','......kgk.......','......kkk.......',
  '................','................','................','................'],
 'bolt': [
  '................','........kk......','.......kyk......','......kyyk......',
  '.....kyyYk......','....kyyYYk......','...kyyYYYkkkk...','..kyyyyyyyyyk...',
  '...kkkkyyYYYk...','......kyYYYk....','......kYYYk.....','.....kYYYk......',
  '.....kYYk.......','....kYk.........','....kk..........','................'],
 'book': [
  '................','..kkkkk..kkkkk..','.keeeeekkeeeeek.','.kevvvvkkvvvvek.',
  '.kevkkvkkvkkvek.','.kevvvvkkvvvvek.','.kevkkvkkvkkvek.','.kevvvvkkvvvvek.',
  '.kevkkvkkvkkvek.','.kevvvvkkvvvvek.','.kevvvvkkvvvvek.','.keeeeekkeeeeek.',
  '..kkkkk..kkkkk..','................','................','................'],
 'crown': [
  '................','................','.k..........k...','.kk...kk...kk...',
  'kyk..kyyk..kyk..','kyyk.kyyyk.kyyk.','kyyykyyyyykyyyk.','kyyyyyyyyyyyyyk.',
  'kyyYyyyyyyyYyyk.','kyYYYYYYYYYYYyk.','kyYcYYYcYYYcYyk.','kyYYYYYYYYYYYyk.',
  '.kkkkkkkkkkkkk..','................','................','................'],
 'leaf': [
  '................','..........kk....','.........kk.....','...kkkk.kk......',
  '..knnnnkk.......','.knnnnnnkk......','knnnnnnnnk......','knnnnnnnnNk.....',
  'knnnnnnnNNk.....','.knnnnnNNNk.....','..knnnNNNk......','...kkNNNk.......',
  '.....kkk........','................','................','................'],
 'snow': [
  '................','.......k........','....k..c..k.....','.....k.c.k......',
  '......kck.......','..kkkkcccckkk...','...kkcccccckk...','......kck.......',
  '.....kcccck.....','....kc.c.ck.....','...k...c...k....','.......c........',
  '.......k........','................','................','................'],
 'rock': [
  '................','................','......kkkk......','....kkeeeekk....',
  '...keeeeeeeek...','..keeeewweeeek..','.keeeewwwweeeek.','.keeeewwweeeeEk.',
  'keeeeeeeeeeeEEk.','keeeeeeeeeeEEEk.','kEeeeeeeeeEEEEk.','.kEEeeeeEEEEEk..',
  '..kEEEEEEEEEk...','...kkkkkkkkk....','................','................'],
 'gear': [
  '................','......kkkk......','....kksssskk....','...ksssssssssk..',
  'kkkssskkkksssk..','ksssskk..kkssss.','ksssk......kssk.','kssk........ksk.',
  'kssk........ksk.','ksssk......kssk.','ksssskk..kkssss.','kkkssskkkksssk..',
  '...ksssssssssk..','....kksssskk....','......kkkk......','................'],
 'seed': [
  '................','................','......kk........','.....knnk.......',
  '......kk........','.....kek........','....keeeK.......','...keeeeek......',
  '...keeEeek......','...keeeeek......','....keeek.......','.....kkk........',
  '................','................','................','................'],
 'chili': [
  '................','........kn......','.......knk......','......knnk......',
  '.....kfrrk......','....kfrrrrk.....','...kfrrrrrk.....','...krrrrrrk.....',
  '..krrrrrrk......','..krrrrrk.......','..krrrrk........','..krrrk.........',
  '...kkk..........','................','................','................'],
 'berry': [
  '................','.......nk.......','......knk.......','.....kbbbk......',
  '....kbbwbbk.....','...kbbwbbbbk....','...kbbbbbbbk....','...kBbbbbbBk....',
  '...kBbbbbbBk....','....kBbbbBk.....','.....kBBBk......','......kkk.......',
  '................','................','................','................'],
 'gourd': [
  '................','.......kk.......','......knk.......','.....kknkk......',
  '....knnnnnk.....','...knnwnnnnk....','..knnnnnnnnnk...','..kNnnnnnnnNk...',
  '..kNnnnnnnnNk...','...kNnnnnnNk....','....kNNnNNk.....','.....kkkkk......',
  '................','................','................','................'],
 'bean': [
  '................','................','......kkk.......','.....kyyyk......',
  '....kyywyyk.....','....kyyyyyk.....','.....kyyyyyk....','......kyyyyk....',
  '.....kyyyyk.....','....kyyyyk......','....kyyyk.......','.....kkk........',
  '................','................','................','................'],
 'mint': [
  '................','......k.k.......','.....kckck......','....kcccck......',
  '...kccwccck.....','...kcccccck.....','...kccccccck....','....kcccccck....',
  '.....kcccck.....','......kcck......','.......kk.......','................',
  '................','................','................','................'],
 'rootv': [
  '................','.....k..k.......','....knkknk......','.....kkkk.......',
  '....keeeek......','....keeeek......','.....keeek......','.....keeek......',
  '......keek......','......keek......','.......kek......','.......kk.......',
  '................','................','................','................'],
 'gloomcap': [
  '................','................','.....kkkkk......','...kmmmmmmmk....',
  '..kmmwmmmmmmk...','..kmmmmmwmmmk...','..kkkkkkkkkkk...','.....kvvvk......',
  '.....kvvvk......','.....kvvvk......','......kkk.......','................',
  '................','................','................','................'],
 'starfruit': [
  '................','.......k........','......kyk.......','......kyk.......',
  '..kkkkyyykkkk...','..kyyyyyyyyyk...','...kyyyyyyyk....','....kyyyyyk.....',
  '....kyykyyk.....','...kyyk.kyyk....','...kkk...kkk....','................',
  '................','................','................','................'],
 'kernel': [
  '................','................','......kkk.......','.....ksssk......',
  '....kssswsk.....','....kssssssk....','.....kssssssk...','......kssssk....',
  '.....kssssk.....','....kssssk......','....ksssk.......','.....kkk........',
  '................','................','................','................'],
 'flask': [
  '................','.....kkkk.......','.....kvvk.......','.....kvvk.......',
  '.....kvvk.......','....kvggvk......','...kvgggvvk.....','..kvggggggvk....',
  '..kggwggggggk...','..kggggggggggk..','..kgggggGGggk...','...kgGGGGGGk....',
  '....kkkkkkk.....','................','................','................'],
 'chest': [
  '................','...kkkkkkkkkk...','..keeeeeeeeeek..','..keweeeeeewek..',
  '..keeeeeeeeeek..','..kkkkkkkkkkkk..','..keeekyykeeek..','..keeekyykeeek..',
  '..keeekkkkeeek..','..keeeeeeeeeek..','..keeeeeeeeeek..','..kkkkkkkkkkkk..',
  '................','................','................','................'],
 'map': [
  '................','..kkkkkkkkkkkk..','..kvvnnvvvvvvk..','..kvnnnvvbbvvk..',
  '..kvvnvvvbbbvk..','..kvvvvkvvbvvk..','..kvvvkvkvvvvk..','..kvvkvvvkvvvk..',
  '..kvvvvvvvknnk..','..kvevvvvnnnvk..','..kveevvvvnvvk..','..kkkkkkkkkkkk..',
  '................','................','................','................'],
 'portal': [
  '................','......kkkk......','....kkmmmmkk....','...kmmMMMMmmk...',
  '..kmMMkkkkMMmk..','..kmMkmmmmkMmk..','..kmMkmwwmkMmk..','..kmMkmwwmkMmk..',
  '..kmMkmmmmkMmk..','..kmMMkkkkMMmk..','...kmmMMMMmmk...','....kkmmmmkk....',
  '......kkkk......','................','................','................'],
 'skull': [
  '................','.....kkkkkk.....','...kkwwwwwwkk...','..kwwwwwwwwwwk..',
  '..kwwkkwwkkwwk..','..kwkddwwddkwk..','..kwkddwwddkwk..','..kwwkkwwkkwwk..',
  '..kwwwwkkwwwwk..','...kwwwwwwwwk...','....kwkwwkwk....','....kwkwwkwk....',
  '.....kkkkkk.....','................','................','................'],
}

ORDER = list(ICONS)


def draw_icon(rows):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows[:S]):
        for x, ch in enumerate(row[:S]):
            c = P.get(ch)
            if c:
                px[x, y] = c + (255,)
    return im


def build_sheet():
    cols = len(ORDER)
    sheet = Image.new('RGBA', (cols * S, S), (0, 0, 0, 0))
    for i, key in enumerate(ORDER):
        sheet.paste(draw_icon(ICONS[key]), (i * S, 0))
    sheet = sheet.resize((cols * S * SCALE, S * SCALE), Image.NEAREST)
    sheet.save(os.path.join(OUT, 'icons.png'))
    return cols


def build_frames():
    """9-slice frames: 24x24 with an 8px corner inset."""
    def frame(name, outer, mid, inner, fill, stud=None):
        n = 24
        im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        px = im.load()
        for y in range(n):
            for x in range(n):
                d = min(x, y, n - 1 - x, n - 1 - y)
                if d == 0:
                    c = outer
                elif d == 1:
                    c = mid
                elif d == 2:
                    c = inner
                else:
                    c = fill
                px[x, y] = c + (255,)
        # corner studs read as rivets once the frame is stretched
        if stud:
            for (cx, cy) in ((3, 3), (n - 4, 3), (3, n - 4), (n - 4, n - 4)):
                px[cx, cy] = stud + (255,)
        im.resize((n * 2, n * 2), Image.NEAREST).save(os.path.join(OUT, name))

    frame('frame-wood.png', (46, 30, 22), (120, 76, 42), (168, 112, 62), (58, 40, 66), (222, 176, 96))
    frame('frame-dark.png', (18, 14, 30), (74, 62, 122), (110, 94, 168), (38, 32, 62), (168, 150, 230))
    frame('frame-box.png', (20, 16, 34), (232, 236, 250), (150, 160, 200), (44, 38, 72), (255, 255, 255))
    frame('frame-gold.png', (48, 32, 8), (196, 146, 40), (255, 212, 96), (58, 44, 30), (255, 246, 200))


def build_css(cols):
    w = cols * S * SCALE
    lines = [
        '/* generated by tools/make-ui-art.py — do not hand-edit */',
        '.ico{display:inline-block;width:16px;height:16px;vertical-align:-3px;',
        "  background-image:url(../assets/ui/icons.png);background-repeat:no-repeat;",
        f'  background-size:{w // SCALE}px 16px;image-rendering:pixelated;flex:none;}}',
        '.ico.big{width:24px;height:24px;background-size:%dpx 24px;vertical-align:-5px;}'
        % (w // SCALE * 24 // 16),
        '.ico.huge{width:32px;height:32px;background-size:%dpx 32px;vertical-align:-7px;}'
        % (w // SCALE * 2),
    ]
    for i, key in enumerate(ORDER):
        lines.append(f'.ico-{key}{{background-position:-{i * 16}px 0;}}')
        lines.append(f'.ico.big.ico-{key}{{background-position:-{i * 24}px 0;}}')
        lines.append(f'.ico.huge.ico-{key}{{background-position:-{i * 32}px 0;}}')
    open(os.path.join(ROOT, 'css', 'icons.css'), 'w').write('\n'.join(lines) + '\n')


def main():
    cols = build_sheet()
    build_frames()
    build_css(cols)
    print(f'{cols} icons -> assets/ui/icons.png, 4 frames, css/icons.css')


if __name__ == '__main__':
    main()
