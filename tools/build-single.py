#!/usr/bin/env python3
"""Bundle Ritual Beasts into one self-contained HTML file.

Inlines the stylesheet, every script, and all 350 image assets as data URIs so
the game runs from a single file with no server and no network access.
Sprites are colour-quantized (pixel art tolerates a small palette) to keep the
bundle to a sane size.

Usage: python3 tools/build-single.py [out.html]
"""
import base64, io, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'ritual-beasts.html')
SPRITE_COLORS = 64


def quantize_sprite(path):
    """RGBA png -> palette png whose last palette index is fully transparent.

    NOTE: PNG `optimize=True` re-packs the palette and would move (thus break)
    the transparency index, so it must stay off here.
    """
    im = Image.open(path).convert('RGBA')
    alpha = im.getchannel('A').point(lambda v: 255 if v > 128 else 0)
    q = im.convert('RGB').quantize(colors=SPRITE_COLORS - 1, method=Image.MEDIANCUT,
                                   dither=Image.NONE)
    trans = SPRITE_COLORS - 1
    # pad the palette to exactly `trans` colours before appending the transparent
    # slot — sprites with few colours quantize to a short palette, which would
    # otherwise land the transparent entry at the wrong index.
    pal = q.getpalette()[:trans * 3]
    pal += [0, 0, 0] * (trans - len(pal) // 3)
    q.putpalette(pal + [0, 0, 0])
    px, ap = q.load(), alpha.load()
    w, h = q.size
    for y in range(h):
        for x in range(w):
            if ap[x, y] == 0:
                px[x, y] = trans
    buf = io.BytesIO()
    q.save(buf, 'PNG', optimize=False, transparency=trans, compress_level=9)
    return buf.getvalue(), 'image/png'


def shrink_bg(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.gif':                      # animated — pass through untouched
        return open(path, 'rb').read(), 'image/gif'
    im = Image.open(path)
    w, h = im.size
    if ext == '.jpg' or ext == '.jpeg':
        if w > 1100:
            im = im.resize((1100, round(h * 1100 / w)), Image.LANCZOS)
        buf = io.BytesIO()
        im.convert('RGB').save(buf, 'JPEG', quality=74, optimize=True, progressive=True)
        return buf.getvalue(), 'image/jpeg'
    # pixel-art png: integer nearest downscale only, so pixels stay square
    k = 1
    while w // (k + 1) >= 900 and w % (k + 1) == 0 and h % (k + 1) == 0:
        k += 1
    if k > 1:
        im = im.resize((w // k, h // k), Image.NEAREST)
    buf = io.BytesIO()
    im.convert('RGBA').quantize(colors=128, dither=Image.NONE).save(buf, 'PNG', optimize=True)
    return buf.getvalue(), 'image/png'


def data_uri(raw, mime):
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    assets = {}
    total = 0

    for name in sorted(os.listdir(os.path.join(ROOT, 'assets', 'creatures'))):
        p = os.path.join(ROOT, 'assets', 'creatures', name)
        raw, mime = quantize_sprite(p)
        total += len(raw)
        assets[f'assets/creatures/{name}'] = data_uri(raw, mime)

    for name in sorted(os.listdir(os.path.join(ROOT, 'assets', 'bg'))):
        p = os.path.join(ROOT, 'assets', 'bg', name)
        raw, mime = shrink_bg(p)
        total += len(raw)
        assets[f'assets/bg/{name}'] = data_uri(raw, mime)

    print(f'{len(assets)} assets, {total/1e6:.2f} MB binary')

    html = open(os.path.join(ROOT, 'index.html')).read()
    scripts = re.findall(r'<script src="([^"]+)"></script>', html)
    sheets = re.findall(r'<link rel="stylesheet" href="([^"]+)">', html)

    # the icon sheet is referenced from icons.css and must travel inline too
    ico_raw = open(os.path.join(ROOT, 'assets', 'ui', 'icons.png'), 'rb').read()
    ico_uri = data_uri(ico_raw, 'image/png')
    total_css = 0
    css_parts = []
    for href in sheets:
        text = open(os.path.join(ROOT, href)).read()
        text = text.replace('url(../assets/ui/icons.png)', f'url({ico_uri})')
        total_css += len(text)
        css_parts.append(text)
    print(f'{len(sheets)} stylesheets inlined, icon sheet {len(ico_raw)/1000:.1f}KB')

    body = html.split('<body>', 1)[1].split('</body>', 1)[0]
    body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)

    parts = ['<title>Ritual Beasts — habit-powered idle RPG</title>',
             '<style>\n' + '\n'.join(css_parts) + '\n</style>',
             body.strip(),
             '<script>window.ASSETS = ' + repr(assets).replace("'", '"') + ';</script>']
    for s in scripts:
        parts.append('<script>\n' + open(os.path.join(ROOT, s)).read() + '\n</script>')

    out = '\n'.join(parts)
    open(OUT, 'w').write(out)
    print(f'wrote {OUT}  ({os.path.getsize(OUT)/1e6:.2f} MB)')


if __name__ == '__main__':
    main()
