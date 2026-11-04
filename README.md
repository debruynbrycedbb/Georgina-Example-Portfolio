# Georgina Marrison — portfolio

Scroll to walk a watercolour path toward the mountain. Slender trees pass the camera as 2D cut-outs, the scene dissolves into white paper, and the paper becomes the photo gallery.

## How it works

- `index.html`: one page. A tall `.journey` section holds a sticky full-screen `<canvas>`, and the `#gallery` section follows it.
- `js/scene.js`: the walk. Each tree has a position in a small 3D world, in metres. Scroll progress moves the camera forward.
  - **Ground:** drawn row by row in true perspective from a top-down texture (`ground.webp`). It moves at exactly the same speed as everything standing on it, so trees stay rooted.
  - **Trees:** cut-outs projected with the same camera (`size = focal / distance`). Near ones grow and slide off the sides, and far ones soften into the watercolour mist, then fade out. Each tree has a faint lavender ground shadow.
  - **Forest:** one row of trees lines the path, with a jittered grid of trees behind them on both sides. A clear corridor keeps the mountain in view.
  - **Backdrop:** sky and mountains. They drift closer slowly, and at the end a paper-white glow fills the screen with the gallery's paper colour, so the hand-off is seamless.
  - **Auto quality:** if frames run slow, it drops to 1× pixels, then thins the back of the forest.
- `tools/make_ground.py`: rebuilds `ground.webp` from the backdrop. It un-warps the painted path and watercolour into a top-down tile that repeats seamlessly.
- `js/gallery.js`: fades paintings in as they appear, and runs a lightbox (click, ← →, Esc).
- No libraries and no build step.

## Tuning the walk

Everything is in `CONFIG` at the top of `js/scene.js`:

| Setting | What it does |
|---|---|
| `walkLength` | metres walked; more = more trees pass you |
| `walkShare` | share of the scroll spent walking (the rest is arriving in the light) |
| `eyeHeight` | camera height; lower = trees feel taller and closer |
| `backdropZoom` / `arrivalZoom` | how much the background zooms while walking / at the end |
| `trees.every`, `trees.setBack` | spacing of the trees along the path / how far back from the path they stand |
| `forest.depth`, `forest.cell`, `forest.density` | how deep, how tightly packed and how full the wood behind the path is |
| `haze`, `fade` | the distances where trees start to soften into mist / appear |
| `shadow` | size of the soft shadow under each tree |
| `pathLeft`, `pathRight` | where the painted path's edges are (metres from the camera) |
| `smoothing` | lower = floatier scroll |
| `seed` | change it for a different random arrangement |

The scroll distance itself is `--walk-length` in `css/style.css` (394vh on desktop, 331vh on phones; one screen of that is the scene itself). When the walk ends, the page glides on into the gallery by itself: see `carryToGallery` in `scene.js`.

You can also tune it live in the browser console:
```js
walkScene.config.walkLength = 90; walkScene.redraw();
```

## Assets

- `assets/scene/backdrop.webp`: the watercolour with the path (also shown on its own when reduced motion is on or JavaScript is off)
- `assets/scene/ground.webp`: top-down ground tile (made by `tools/make_ground.py`)
- `assets/scene/tree-1…8.webp`: tree cut-outs, with the needle-point base trimmed so they sit on the ground (`-sm` versions are served to phones)
- `assets/gallery/painting-1…11.webp`: gallery images (`-sm` = grid thumbnails)

To add a new tree: export a transparent WebP, add it to `TREES` in `scene.js`, and set `trunkX` to where the trunk meets the ground (as a fraction of the image width).

## Placeholders to replace

- `[Short introduction to the work, to be supplied]`
- `[Painting title N]` for the paintings that only had a camera file name (IMG_…), and `[Year · medium]` for every painting
- `[Contact email]`

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Rebuild the ground after changing the backdrop:

```bash
pip install numpy scipy pillow
python3 tools/make_ground.py "path/to/background image with path.png" assets/scene/ground.webp
```
