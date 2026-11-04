"""Soft margins around the backdrop so the camera can pull back (zoom out).

Just past each edge the painting is mirrored (so there is no seam), and that
quickly melts into a soft wash that continues the edge colours outward, so
the extension reads as more sky / more paper rather than a reflection.

The page draws this small, low-resolution image first and the sharp
backdrop.webp on top of it, so only the soft margins come from here
(keeping each image small keeps drawing fast on phones).

usage: python3 tools/make_backdrop_wide.py "<background image with path.png>" assets/scene/backdrop-margins.webp
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
PAD = dict(l=320, r=320, t=540, b=300)   # must match CONFIG.backdrop.pad in scene.js

im = Image.open(SRC).convert('RGB').resize((1672, 941), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
mir = np.pad(a, ((PAD['t'], PAD['b']), (PAD['l'], PAD['r']), (0, 0)), mode='symmetric')
edge = np.pad(a, ((PAD['t'], PAD['b']), (PAD['l'], PAD['r']), (0, 0)), mode='edge')
H, W = edge.shape[:2]
# very soft continuation of the edge colours (blurred at 1/8 size for speed)
small = Image.fromarray(edge.astype(np.uint8)).resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(22))
soft = np.asarray(small.resize((W, H), Image.BICUBIC)).astype(np.float32)

y = np.arange(H)[:, None]; x = np.arange(W)[None, :]
# distance (px) outside the original painting
dy = np.maximum(PAD['t'] - y, y - (PAD['t'] + 940)).clip(0)
dx = np.maximum(PAD['l'] - x, x - (PAD['l'] + 1671)).clip(0)
d = np.maximum(dy, dx).astype(np.float32)
w = np.clip(d / 110, 0, 1)[..., None]
w = w * w * (3 - 2 * w)
# further out, the wash thins to bare paper (the site's paper colour)
PAPER = np.array([246, 241, 230], np.float32)
p = np.clip((d - 60) / 380, 0, 0.85)[..., None]
fill = soft * (1 - p) + PAPER * p
out = mir * (1 - w) + fill * w
SCALE = 0.4   # margins are soft, low resolution is plenty — must match CONFIG.backdrop.marginScale
marg = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
marg = marg.resize((round(W * SCALE), round(H * SCALE)), Image.LANCZOS)
marg.save(OUT, 'WEBP', quality=80, method=6)
print('backdrop-margins', marg.size)
