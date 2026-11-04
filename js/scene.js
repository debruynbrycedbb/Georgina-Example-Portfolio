/* ==========================================================
   Scroll-walk scene
   ----------------------------------------------------------
   Every tree has a real position in a small 3D world
   (metres). Scrolling moves the camera forward along the path.

   - The ground is drawn row by row in true perspective from a
     top-down texture (ground.webp), so it moves at exactly the same
     speed as everything standing on it — trees stay rooted.
   - Trees are 2D cut-outs projected with the same camera: near
     ones grow and slide off the sides, far ones fade into the
     watercolour mist.
   - The backdrop (sky and mountains) sits behind it all.

   Tune the walk with CONFIG below.
   ========================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  if (root.classList.contains('reduced-motion')) {
    // Still painting instead of the walk (only downloaded when needed)
    const still = document.querySelector('.scene-static[data-src]');
    if (still) still.src = still.dataset.src;
    return;
  }

  const CONFIG = {
    walkLength: 64,      // metres walked between the top of the page and the light
    walkShare: 0.8,      // share of the scroll spent walking; the rest is arriving in the light
    eyeHeight: 1.6,      // camera height in metres — must match tools/make_ground.py
    backdropZoom: 0.12,  // how much the distant mountains drift closer while walking
    arrivalZoom: 2.6,    // zoom into the paper-white at the end
    smoothing: 0.09,     // 0–1, lower = floatier scroll

    // Where the path disappears in backdrop.webp (fraction of width / height)
    vanishing: { x: 846 / 1672, y: 428 / 941 },
    // where the horizon sits on screen (fraction of height); lower on phones = more sky and treetops
    horizonOnScreen: { desktop: 0.5, phone: 0.57 },
    // Camera zoom: 1 = the painting just fills the screen, lower = pulled back to see more
    // (more of the treetops, sky and mountains). Phones are pulled back further.
    view: { desktop: 0.78, phone: 0.6 },
    // The painting, plus soft margins drawn behind it (tools/make_backdrop_margins.py)
    // so the camera can pull back without showing its edges
    backdrop: { file: 'backdrop.webp', margins: 'backdrop-margins.webp', w: 1672, h: 941, pad: { l: 320, t: 540 } },

    // Path edges in metres (negative = left), as painted in the backdrop
    pathLeft: -0.55,
    pathRight: 0.55,

    // Row of trees lining the path
    trees: { every: 3.4, height: [8.5, 11.5], setBack: [1.1, 2.8] },
    // The wood behind them
    forest: { depth: 14, cell: 3.4, density: 0.55, height: [9, 13] },

    ground: { file: 'ground.webp', pxPerMetre: 64, xMin: -24, z0: 3.0, fadeFrom: 26, fadeTo: 40 },
    haze: { from: 8, to: 40, colour: 'rgba(238, 242, 249, 0.75)' }, // distant trees soften into mist
    fade: { from: 38, to: 56 },
    shadow: { width: 1.5, depth: 0.7 },  // ground shadow under each tree (metres)  // cut-outs appear out of the haze between these distances
    seed: 11,
  };

  /* ---------- assets ---------- */
  const SRC = 'assets/scene/';
  // trunkX = where the trunk meets the ground, as a fraction of image width
  const TREES = [
    { file: 'tree-1.webp', trunkX: 0.491 },
    { file: 'tree-2.webp', trunkX: 0.475 },
    { file: 'tree-3.webp', trunkX: 0.414 },
    { file: 'tree-4.webp', trunkX: 0.484 },
    { file: 'tree-5.webp', trunkX: 0.322 },
    { file: 'tree-6.webp', trunkX: 0.373 },
    { file: 'tree-7.webp', trunkX: 0.440 },
    { file: 'tree-8.webp', trunkX: 0.266 },
  ];
  const BACKDROP = { file: CONFIG.backdrop.file };
  const MARGINS = { file: CONFIG.backdrop.margins };
  const GROUND = { file: CONFIG.ground.file };

  // Phones get lighter cut-outs (55% size) — the watercolour style hides the softness
  const small = window.innerWidth < 900;
  const load = a => new Promise(res => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { a.img = img; res(); });
    img.onerror = () => res(); // a missing layer shouldn't break the page
    const sized = small && TREES.includes(a);
    img.src = SRC + (sized ? a.file.replace('.webp', '-sm.webp') : a.file);
  });

  // A hazy copy of each cut-out, used for distant trees (aerial perspective)
  function makeHaze(a) {
    const c = document.createElement('canvas');
    c.width = a.img.naturalWidth; c.height = a.img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(a.img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = CONFIG.haze.colour;
    g.fillRect(0, 0, c.width, c.height);
    a.haze = c;
  }

  // Ground texture + smaller copies for far-away rows (stops shimmering)
  function makeMips() {
    const levels = [GROUND.img];
    let prev = GROUND.img;
    for (let i = 1; i < 5; i++) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(prev.width / 2));
      c.height = Math.max(1, Math.round(prev.height / 2));
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(prev, 0, 0, c.width, c.height);
      levels.push(c);
      prev = c;
    }
    GROUND.levels = levels;
  }

  // Soft lavender blot used as each tree's ground shadow
  const SHADOW = document.createElement('canvas');
  SHADOW.width = 128; SHADOW.height = 32;
  {
    const g = SHADOW.getContext('2d');
    g.setTransform(1, 0, 0, 0.25, 0, 0);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(92, 84, 150, 0.42)');
    r.addColorStop(0.55, 'rgba(110, 104, 170, 0.18)');
    r.addColorStop(1, 'rgba(110, 104, 170, 0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }

  // Fade the painting's sides and top into the soft margins drawn behind it (no hard seam)
  function featherBackdrop() {
    const img = BACKDROP.img, w = img.naturalWidth, h = img.naturalHeight, e = Math.round(w * 0.05);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
      [0, 0, e, 0, 0, 0, e, h], [w, 0, w - e, 0, w - e, 0, e, h], [0, 0, 0, e, 0, 0, w, e]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    }
    BACKDROP.img = c;
  }

  /* ---------- build the world (deterministic) ---------- */
  let seed = CONFIG.seed;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const between = ([a, b]) => a + (b - a) * rand();
  const pick = arr => arr[Math.floor(rand() * arr.length)];

  const sprites = [];
  const farthest = CONFIG.walkLength + CONFIG.fade.to + 10;
  const edgeOf = s => (s < 0 ? CONFIG.pathLeft : CONFIG.pathRight);

  // 1. Trees lining the path: alternate sides with jitter
  let side = -1;
  for (let z = 5; z < farthest; z += CONFIG.trees.every * (0.75 + rand() * 0.5)) {
    side = rand() < 0.8 ? -side : side;
    sprites.push({ kind: 'tree', a: pick(TREES), z, x: edgeOf(side) + side * between(CONFIG.trees.setBack), h: between(CONFIG.trees.height), flip: rand() < 0.5 });
  }

  // 2. The wood: a jittered grid of trees filling both sides
  const F = CONFIG.forest;
  for (const s of [-1, 1]) {
    const inner = Math.abs(edgeOf(s)) + CONFIG.trees.setBack[1] + 0.8;
    for (let gx = 0; gx * F.cell < F.depth; gx++) {
      for (let gz = 0; gz * F.cell < farthest; gz++) {
        // a little thinner far from the path so the backdrop still glows through
        if (rand() > F.density - gx * 0.03) continue;
        const ax = inner + (gx + rand()) * F.cell;
        const z = 1 + (gz + rand()) * F.cell;
        // lod: 1 = dropped first if the device struggles
        sprites.push({ kind: 'tree', a: pick(TREES), z, x: s * ax, h: between(F.height), flip: rand() < 0.5, lod: gx > 0 && rand() < 0.5 ? 1 : 0 });
      }
    }
  }

  sprites.sort((p, q) => q.z - p.z); // far first (painter's algorithm)

  /* ---------- canvas & layout ---------- */
  const canvas = document.querySelector('.scene');
  const ctx = canvas.getContext('2d');
  const journey = document.querySelector('.journey');
  const bar = document.querySelector('.progress span');
  const intro = document.querySelector('.intro');

  let W = 0, H = 0, dpr = 1;
  // Quality steps down automatically on slow devices: 0 = full, 1 = 1x pixels, 2 = also thinner forest
  let quality = 0, slowFrames = 0;
  let base = 1, cx = 0, horizonY = 0, focal = 0, xSquash = 1;

  function layout() {
    const r = canvas.getBoundingClientRect();
    // phones fire resize when the address bar moves; nothing to do if the stage didn't change
    // cap the pixel count so big retina screens stay smooth
    const nextDpr = quality > 0 ? 1 : Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4.2e6 / (r.width * r.height)));
    if (r.width === W && r.height === H && nextDpr === dpr && canvas.width) return;
    W = r.width; H = r.height; dpr = nextDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    const bw = CONFIG.backdrop.w, bh = CONFIG.backdrop.h; // the painting itself (without margins)
    const vx = CONFIG.vanishing.x;
    // the scale at which the painting just covers the screen with the vanishing point centred,
    // then pulled back by the camera zoom (the soft margins fill the extra room)
    const device = W / H < 1 ? 'phone' : 'desktop';
    const zoom = CONFIG.view[device];
    base = Math.max(W / (2 * Math.min(vx, 1 - vx) * bw), H / bh) * zoom;
    cx = W / 2;
    horizonY = H * CONFIG.horizonOnScreen[device];
    focal = bh * base;                                   // px per metre at 1 m distance
    xSquash = Math.min(1, Math.max(0.5, (W / H) / 1.5)); // pull the sides inward on tall phones
  }

  /* ---------- scroll state ---------- */
  let target = 0, current = 0, raf = 0;

  const clamp01 = v => Math.min(1, Math.max(0, v));
  const ease = t => t * t * (3 - 2 * t);

  const stage = document.querySelector('.stage');
  const gallery = document.querySelector('#gallery');
  function readScroll() {
    const r = journey.getBoundingClientRect();
    const total = r.height - stage.offsetHeight; // the scroll distance while the stage is pinned
    target = total > 0 ? clamp01(-r.top / total) : 0;
  }

  // Reaching the end of the path carries you on into the light and down to the gallery
  let carried = false, lastTarget = 0;
  function carryToGallery() {
    if (target >= CONFIG.walkShare && target > lastTarget && !carried) {
      carried = true;
      window.scrollTo({ top: gallery.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
    }
    if (target < CONFIG.walkShare - 0.05) carried = false; // walking back resets it
    lastTarget = target;
  }

  /* ---------- ground (perspective floor) ---------- */
  function drawGround(camZ, f) {
    const G = CONFIG.ground, lv = GROUND.levels;
    if (!lv) return;
    const texW = lv[0].width, texH = lv[0].height;
    const eye = CONFIG.eyeHeight;
    const yStart = Math.ceil(horizonY + (eye * f) / G.fadeTo);
    for (let y = yStart, step = 1; y < H; y += step) {
      step = y - horizonY > (small ? 90 : 220) ? 2 : 1; // near ground changes slowly: 2px rows
      const dy = y + step / 2 - horizonY;
      const Z = (eye * f) / dy;                      // distance to this strip of ground
      const mPerPx = Z / (f * xSquash);              // metres per screen px across
      const texPerPx = Math.max(mPerPx, (eye * f) / (dy * dy) * step) * G.pxPerMetre / dpr;
      const level = Math.min(lv.length - 1, Math.max(0, Math.floor(Math.log2(texPerPx))));
      const tex = lv[level], k = tex.width / texW;

      let v = ((Z + camZ - G.z0) * G.pxPerMetre) % texH;
      if (v < 0) v += texH;
      const u0 = ((-cx * mPerPx) - G.xMin) * G.pxPerMetre;
      const uw = W * mPerPx * G.pxPerMetre;
      // clip to the texture's width
      const a = Math.max(0, u0), b = Math.min(texW, u0 + uw);
      if (b <= a) continue;
      const dx = ((a - u0) / uw) * W, dw = ((b - a) / uw) * W;

      ctx.globalAlpha = clamp01((G.fadeTo - Z) / (G.fadeTo - G.fadeFrom));
      const rowTex = Math.max(0.5, (eye * f) / (dy * dy) * step * G.pxPerMetre) * k;
      ctx.drawImage(tex, a * k, Math.min(v * k, tex.height - rowTex), (b - a) * k, rowTex, dx, y, dw, step + 0.02);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- render ---------- */
  function render(p) {
    const walk = clamp01(p / CONFIG.walkShare);
    const arrive = clamp01((p - CONFIG.walkShare * 0.95) / (1 - CONFIG.walkShare * 0.95));
    const camZ = CONFIG.walkLength * walk;
    const arrival = 1 + CONFIG.arrivalZoom * arrive * arrive;
    const f = focal * arrival;   // one focal length for ground and cut-outs = rooted trees

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    // 1. Backdrop (distant sky, canopy and light), drifting closer slowly
    if (BACKDROP.img) {
      const s = base * (1 + CONFIG.backdropZoom * walk) * arrival;
      const B = CONFIG.backdrop;
      const x0 = cx - CONFIG.vanishing.x * B.w * s, y0 = horizonY - CONFIG.vanishing.y * B.h * s;
      const M = MARGINS.img;
      if (M) { // soft margins first (low-res image covering the painting plus its margins)
        const k = (B.w + 2 * B.pad.l) / M.naturalWidth; // margin-image px -> painting px
        ctx.drawImage(M, x0 - B.pad.l * s, y0 - B.pad.t * s, M.naturalWidth * k * s, M.naturalHeight * k * s);
      }
      ctx.drawImage(BACKDROP.img, x0, y0, B.w * s, B.h * s);
    }

    // 2. Ground
    drawGround(camZ, f);

    // 3. Cut-outs in perspective, far to near
    const Hz = CONFIG.haze;
    for (const sp of sprites) {
      const img = sp.a.img;
      if (!img || (quality > 1 && sp.lod)) continue;
      const d = sp.z - camZ;                       // distance ahead of the camera
      if (d < 0.3) continue;                       // behind us
      const fade = clamp01((CONFIG.fade.to - d) / (CONFIG.fade.to - CONFIG.fade.from));
      if (fade <= 0) continue;
      const k = f / d;                             // px per metre at that distance
      const gx = cx + sp.x * k * xSquash;
      const gy = horizonY + CONFIG.eyeHeight * k;  // where it meets the ground
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const h = sp.h * k, w = h * iw / ih;
      let anchor = sp.a.trunkX;
      if (sp.flip) anchor = 1 - anchor;
      const left = gx - anchor * w;
      const topY = gy - h * 0.985; // the soft base sinks slightly into the ground
      if (left > W || left + w < 0 || topY > H) continue;        // off screen

      const haze = sp.a.haze ? clamp01((d - Hz.from) / (Hz.to - Hz.from)) : 0;
      // a soft watercolour shadow where the trunk meets the ground
      if (d < 30) {
        const sw = CONFIG.shadow.width * k * xSquash;
        const sh = Math.max(2, (CONFIG.eyeHeight * f * CONFIG.shadow.depth) / (d * d));
        ctx.globalAlpha = fade * (1 - haze) * clamp01((30 - d) / 8);
        ctx.drawImage(SHADOW, gx - sw / 2, gy - sh / 2, sw, sh);
      }
      if (haze > 0.02) blit(sp.a.haze, left, topY, w, h, sp.flip, fade);
      if (haze < 0.98) blit(img, left, topY, w, h, sp.flip, fade * (1 - haze));
    }
    ctx.globalAlpha = 1;

    // 4. Paper-white glow at the end of the path, swelling into the gallery
    const glowR = Math.hypot(W, H) * (0.12 + 0.18 * walk + 1.3 * arrive);
    const g = ctx.createRadialGradient(cx, horizonY - 10, 0, cx, horizonY - 10, glowR);
    const a0 = 0.1 + 0.2 * walk + 0.7 * arrive;
    g.addColorStop(0, `rgba(253, 251, 246, ${a0})`);
    g.addColorStop(0.45, `rgba(246, 241, 230, ${a0 * 0.45})`);
    g.addColorStop(1, 'rgba(246, 241, 230, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const wash = ease(clamp01((arrive - 0.45) / 0.55));
    if (wash > 0) {
      ctx.fillStyle = `rgba(246, 241, 230, ${wash})`; // = --paper, so the gallery follows seamlessly
      ctx.fillRect(0, 0, W, H);
    }

    // UI
    bar.style.transform = `scaleX(${walk})`;
    bar.parentElement.style.opacity = 1 - wash;
    intro.style.opacity = 1 - clamp01(p / 0.05);
    root.classList.toggle('is-arrived', wash > 0.6 || p >= 1);
  }

  function blit(img, x, y, w, h, flip, alpha) {
    ctx.globalAlpha = alpha;
    if (flip) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
  }

  function tick() {
    current += (target - current) * CONFIG.smoothing;
    if (Math.abs(target - current) < 0.00005) current = target;
    const t0 = performance.now();
    render(current);
    adapt(performance.now() - t0);
    raf = current !== target ? requestAnimationFrame(tick) : 0;
  }
  // If frames keep taking too long, step quality down (once per step)
  function adapt(ms) {
    if (quality >= 2 || !root.classList.contains('is-ready')) return;
    slowFrames = ms > 20 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 12) { quality++; slowFrames = 0; layout(); }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function onScroll() { readScroll(); carryToGallery(); kick(); }
  function onResize() { layout(); readScroll(); render(current); }

  // Backdrop + ground first, then the cut-outs
  Promise.all([load(BACKDROP), load(MARGINS), load(GROUND)]).then(() => {
    if (GROUND.img) makeMips();
    if (BACKDROP.img && MARGINS.img) featherBackdrop();
    layout(); readScroll(); current = target; render(current);
    return Promise.all(TREES.map(load));
  }).then(() => {
    TREES.forEach(t => t.img && makeHaze(t));
    root.classList.add('is-ready');
    render(current);
  });

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);

  // Expose for tuning in the console: e.g. walkScene.config.walkLength = 80; walkScene.redraw()
  window.walkScene = { config: CONFIG, sprites, redraw: () => { layout(); render(current); }, renderAt: render, get quality() { return quality; } };
})();
