#!/usr/bin/env python3
"""Bundle Hourling into one self-contained HTML file.

Inlines the stylesheet, every script, and all 350 image assets as data URIs so
the game runs from a single file with no server and no network access.
Sprites are colour-quantized (pixel art tolerates a small palette) to keep the
bundle to a sane size.

Usage: python3 tools/build-single.py [out.html]
"""
import base64, io, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'hourling.html')
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

    # sheets fetched from JS via assetUrl() (the VFX atlas) must be in the map too
    ui_dir = os.path.join(ROOT, 'assets', 'ui')
    # vfx atlas, the professor sprite and the app icons are referenced from JS
    for name in ['vfx.png', 'npc.png', 'app-180.png', 'app-192.png', 'app-512.png']:
        p = os.path.join(ui_dir, name)
        if os.path.exists(p):
            with open(p, 'rb') as fh:
                raw = fh.read()
            total += len(raw)
            assets[f'assets/ui/{name}'] = data_uri(raw, 'image/png')

    print(f'{len(assets)} assets, {total/1e6:.2f} MB binary')

    html = open(os.path.join(ROOT, 'index.html')).read()
    scripts = re.findall(r'<script src="([^"]+)"></script>', html)
    sheets = re.findall(r'<link rel="stylesheet" href="([^"]+)">', html)

    # every sheet the CSS points at (icons, soil, fence, plants, props, frames)
    # has to travel inline too — the published page may not fetch anything.
    ui_cache = {}

    def inline_css_url(m):
        rel = m.group(1)
        path = os.path.normpath(os.path.join(ROOT, 'css', rel))
        if path not in ui_cache:
            with open(path, 'rb') as fh:
                ui_cache[path] = data_uri(fh.read(), 'image/png')
        return 'url(' + ui_cache[path] + ')'

    total_css = 0
    css_parts = []
    for href in sheets:
        text = open(os.path.join(ROOT, href)).read()
        text = re.sub(r'url\((\.\./assets/[^)]+\.png)\)', inline_css_url, text)
        total_css += len(text)
        css_parts.append(text)
    # guard: a sheet inlined many times means its url() is repeated across keyed
    # rules, which silently multiplied the bundle by ~1.8MB once already
    joined = '\n'.join(css_parts)
    for path, uri in ui_cache.items():
        hits = joined.count(uri)
        if hits > 3:
            raise SystemExit(
                f'ERROR: {os.path.basename(path)} inlined {hits}x '
                f'(+{hits * len(uri) / 1e6:.2f}MB). Group the shared url() in the '
                f'generator instead of repeating it per rule.')

    inlined_bytes = sum(len(v) for v in ui_cache.values())
    print(f'{len(sheets)} stylesheets inlined, {len(ui_cache)} css images '
          f'({inlined_bytes/1000:.1f}KB base64)')
    left = re.findall(r'url\(\.\./assets[^)]*\)', '\n'.join(css_parts))
    assert not left, f'un-inlined css asset refs: {left}' 

    body = html.split('<body>', 1)[1].split('</body>', 1)[0]
    body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)

    def _inline_img(m):
        p = os.path.join(ROOT, m.group(1))
        if not os.path.exists(p):
            return m.group(0)
        return 'src="' + data_uri(open(p, 'rb').read(), 'image/png') + '"'

    # markup image refs (the boot splash) are not covered by the CSS or JS
    # asset maps, so they would 404 in the single-file build
    body = re.sub(r'src="(assets/[^"]+\.png)"', _inline_img, body)

    # ---- a real document, not a fragment ----
    # The previous build emitted a headless fragment starting at <title>: no
    # doctype, no charset, no viewport. Phones therefore rendered the bundle at
    # desktop fallback width and mojibaked its own em-dash, and every mobile
    # meta tag added to index.html never reached the shipped file.
    head = html.split('<head>', 1)[1].split('</head>', 1)[0]
    # stylesheet links are inlined below; local icon links become data URIs
    head = re.sub(r'\s*<link rel="stylesheet"[^>]*>', '', head)

    def _inline_icon(m):
        href = m.group(2)
        p = os.path.join(ROOT, href)
        if not os.path.exists(p):
            return m.group(0)
        uri = data_uri(open(p, 'rb').read(), 'image/png')
        return f'<link rel="{m.group(1)}" href="{uri}">'

    head = re.sub(r'<link rel="(apple-touch-icon|icon)" href="([^"]+)">',
                  _inline_icon, head)

    parts = ['<!DOCTYPE html>', '<html lang="en">', '<head>',
             head.strip(),
             '<style>\n' + '\n'.join(css_parts) + '\n</style>',
             '</head>', '<body>',
             body.strip(),
             '<script>window.ASSETS = ' + repr(assets).replace("'", '"') + ';</script>']
    for s in scripts:
        parts.append('<script>\n' + open(os.path.join(ROOT, s)).read() + '\n</script>')
    parts += ['</body>', '</html>']

    out = '\n'.join(parts)
    # the two things that actually broke mobile rendering
    assert 'charset' in out, 'bundle lost its charset'
    assert 'name="viewport"' in out, 'bundle lost its viewport'
    assert out.startswith('<!DOCTYPE html>'), 'bundle is not a document'
    open(OUT, 'w').write(out)
    print(f'wrote {OUT}  ({os.path.getsize(OUT)/1e6:.2f} MB)')


if __name__ == '__main__':
    main()
