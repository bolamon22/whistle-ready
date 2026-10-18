"""Whistle Ready's app icons, made from public/whistle-ready-icon.png (the rounded
tile with the whistle, on a wide transparent canvas), plus the opaque rule for each
org's own set in public/org-icons/<slug>/.

  apple-touch-icon.png (+ -precomposed)  180  The art cut square inside the tile's
                             rounded border, full bleed. iOS rounds the corners itself.
  icon-192.png, icon-512.png  the manifest's icons, the same full-bleed art. iOS 26
                             takes the home-screen icon from the manifest, and one with
                             transparent corners can come out as a plain letter tile
                             (Bo's iPhone showed "W" and "S", Oct 18 2026), so every
                             one is opaque. Also the notification icon and the emails'
                             fallback logo.
  icon-maskable-512.png      Android adaptive icon: the art at 84% so the whistle stays
                             inside the 80% safe circle, background carried to the edges.
  favicon.ico                the tile at 16, 32 and 48 (browser tabs only).

Org sets: icon-192/512 and apple-touch-icon are flattened onto white if they have any
transparency, and apple-touch-icon is copied to apple-touch-icon-precomposed.

Run from the repo root:  python3 scripts/make-app-icons.py
The manifest must load without a login: phones fetch it and the icons with no cookies.
"""
import os
import shutil
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = 'public/whistle-ready-icon.png'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public'

src = Image.open(SRC).convert('RGBA')
alpha = src.split()[3]
x0, y0, x1, y1 = alpha.point(lambda v: 255 if v > 200 else 0).getbbox()
side = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2

# The tile on its own, square, corners still transparent.
tile = src.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))

# Full bleed: inside the rounded border (about 4.6% in from each edge clears the
# corner curve and the rim highlight).
inset = round(side * 0.046)
full = tile.crop((inset, inset, side - inset, side - inset))
assert full.split()[3].getextrema()[0] == 255, 'full-bleed crop still has transparent pixels'
full = full.convert('RGB')

def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(f'{OUT}/{name}', optimize=True)

save(full, 'apple-touch-icon.png', 180)
save(full, 'apple-touch-icon-precomposed.png', 180)
save(full, 'icon-192.png', 192)
save(full, 'icon-512.png', 512)

# Maskable: art at 84%, its edges carried outward and softened.
inner = round(512 * 0.84)
pad = (512 - inner) // 2
art = full.resize((inner, inner), Image.LANCZOS)
grown = np.pad(np.asarray(art), ((pad, 512 - inner - pad), (pad, 512 - inner - pad), (0, 0)), mode='edge')
canvas = Image.fromarray(grown).filter(ImageFilter.GaussianBlur(28))
feather = round(inner * 0.06)   # blend the art's edge into the carried-out background
edge = Image.new('L', (inner, inner), 0)
ImageDraw.Draw(edge).rectangle([feather, feather, inner - 1 - feather, inner - 1 - feather], fill=255)
canvas.paste(art, (pad, pad), edge.filter(ImageFilter.GaussianBlur(feather / 2)))
canvas.save(f'{OUT}/icon-maskable-512.png', optimize=True)

tile.resize((256, 256), Image.LANCZOS).save(f'{OUT}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('tile', (x0, y0, x1, y1), 'side', side, 'inset', inset)

# Org sets: same rule, no transparency anywhere iOS might pick from.
org_root = os.path.join(OUT, 'org-icons')
for slug in sorted(os.listdir(org_root)) if os.path.isdir(org_root) else []:
    d = os.path.join(org_root, slug)
    for name in ('apple-touch-icon.png', 'icon-192.png', 'icon-512.png'):
        p = os.path.join(d, name)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        if im.split()[3].getextrema()[0] < 255:
            flat = Image.new('RGB', im.size, (255, 255, 255))
            flat.paste(im, (0, 0), im)
            flat.save(p, optimize=True)
            print('flattened', slug, name)
    if os.path.exists(os.path.join(d, 'apple-touch-icon.png')):
        shutil.copyfile(os.path.join(d, 'apple-touch-icon.png'), os.path.join(d, 'apple-touch-icon-precomposed.png'))
