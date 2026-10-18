"""Whistle Ready's app icons, made from public/whistle-ready-icon.png (the rounded
tile with the whistle, on a wide transparent canvas).

  apple-touch-icon.png  180  iPhone/iPad home screen. Cut square inside the tile's
                             rounded border so the art fills it; iOS rounds the
                             corners itself and paints transparent pixels black,
                             so it must be fully opaque.
  icon-192.png, icon-512.png  browser tabs, notifications, desktop/Android
                             installs, the fallback logo in emails: the tile itself,
                             filling the square, corners transparent.
  icon-maskable-512.png      Android adaptive icon: the full-bleed art at 84% so
                             the whistle stays inside the 80% safe circle, with the
                             background carried out to the edges.
  favicon.ico                the tile at 16, 32 and 48.

Run from the repo root:  python3 scripts/make-app-icons.py
The first set (Sep 2026) drew the tile at about a quarter of the square on white,
so it looked tiny on a home screen (Bo, Oct 18 2026).
"""
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
save(tile, 'icon-192.png', 192)
save(tile, 'icon-512.png', 512)

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
