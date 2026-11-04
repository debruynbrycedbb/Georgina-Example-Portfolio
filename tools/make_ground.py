"""Build the walkable ground texture from the backdrop painting.

Un-warps the painted ground (perspective -> top-down), keeps the near part
of it, and makes it tile seamlessly along the path so the scene can scroll
it forever. Beyond the edges of the painting the watercolour is mirrored.

usage: python3 tools/make_ground.py "<background image with path.png>" assets/scene/ground.webp
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

SRC, OUT = sys.argv[1], sys.argv[2]
VPX, VPY = 846, 428          # vanishing point of the path in the painting (px)
F, EYE = 941, 1.6            # focal length (px) and eye height (m) — must match scene.js
PXM = 64                     # texture pixels per metre (watercolour is soft, so this is plenty)
Z0, Z1, BLEND = 3.0, 11.0, 2.0   # depth range taken from the painting (m) and seam blend
XMIN, XMAX = -24.0, 24.0         # world width covered (m)

img = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)

def sample(X, Z):
    dy = EYE * F / Z
    y, x = VPY + dy, VPX + X * dy / EYE
    return np.stack([map_coordinates(img[..., c], [y, x], order=3, mode='mirror') for c in range(3)], -1)

L = Z1 - Z0 - BLEND
rows, cols = int(round(L * PXM)), int((XMAX - XMIN) * PXM)
Zs = Z0 + np.arange(rows) / PXM
Xs = XMIN + np.arange(cols) / PXM
X, Z = np.meshgrid(Xs, Zs)

# seamless along the path: cross-fade the far end of the strip into its start
a, b = sample(X, Z), sample(X, Z + L)
w = np.clip((Z - Z0) / BLEND, 0, 1)[..., None]
w = w * w * (3 - 2 * w)
out = w * a + (1 - w) * b

Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, 'WEBP', quality=86, method=6)
print('ground', cols, 'x', rows, 'px =', XMAX - XMIN, 'm x', round(L, 2), 'm')
