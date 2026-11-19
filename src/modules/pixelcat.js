import sprite from './cat-sprite.json';
import { pointer, reduced } from './env.js';

/**
 * PixelCat — the Pocketmelon mascot as a living sprite.
 *
 * Renders the hand-authored logo sprite (tools/build-sprite.py) into a 44×44
 * pixel buffer at a stepped 12 fps, then scales it up crisply. Each part of
 * the logo is its own layer, so the cat can bob, blink, twitch its ears,
 * follow the cursor with its eyes, and nibble the watermelon (bites + crumbs).
 *
 *   const cat = new PixelCat(canvas, { nibble: true });
 *   cat.nibble();          // take a bite
 *   cat.pop();             // happy hop + sparkles
 *   cat.setProgress(0.6);  // loader mode: eats up to 60% of the slice
 */

const { w: W, h: H, palette, layout } = sprite;
const toRGBA = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  // little-endian ABGR for Uint32Array over ImageData
  return (255 << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
};
const COLORS = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, toRGBA(v)]));
const BITE_ORDER = [14, 8, 21, 3, 26];
const SPARKLE_CYCLE = ['big', 'big', 'big', 'big', 'mid', 'dot', null, null, 'dot', 'mid'];

export class PixelCat {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = { autoplay: true, nibble: true, track: true, interactive: true, fps: 12, maxBites: 3, ...opts };
    this.off = document.createElement('canvas');
    this.off.width = W;
    this.off.height = H;
    this.offCtx = this.off.getContext('2d');
    this.img = this.offCtx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);

    this.frame = 0;
    this.acc = 0;
    this.last = 0;
    this.s = {
      bob: 0, headDY: 0, bodyDY: 0, eyes: 'open', mouth: 'w', eyeDX: 0, eyeDY: 0,
      earL: 0, earR: 0, bites: [], crumbs: [], bursts: [],
    };
    this.queue = [];
    this.timers = { blink: this.rand(20, 50), ear: this.rand(40, 90), nibble: this.rand(50, 90) };
    this.visible = true;
    this.progressBites = null;

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    if (this.opts.manual) {
      // driven externally (e.g. the bead hero): no DOM observers, no own loop
      this.ro = this.io = { disconnect() {} };
      this.render();
      return;
    }
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(canvas.parentElement || canvas);
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(canvas);
    this.resize();

    if (this.opts.interactive) {
      canvas.addEventListener('pointerenter', () => this.pop());
      canvas.addEventListener('click', () => this.nibble());
    }
    this.render();
    if (!reduced || this.opts.forceMotion) requestAnimationFrame(this.loop);
  }

  rand(a, b) { return a + Math.floor(Math.random() * (b - a)); }

  resize() {
    const box = (this.canvas.parentElement || this.canvas).getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const target = Math.min(box.width, box.height || box.width) * dpr;
    const scale = Math.max(1, Math.floor(target / W));
    this.canvas.width = W * scale;
    this.canvas.height = H * scale;
    this.canvas.style.width = `${(W * scale) / dpr}px`;
    this.canvas.style.height = `${(H * scale) / dpr}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.render();
  }

  /* ------------------------------------------------------------ sequencing */
  get busy() { return this.queue.length > 0; }

  play(steps) {
    this.queue.push(...steps.map((s) => ({ ...s, left: s.frames })));
  }

  nibble() {
    if (this.busy) return;
    const maxed = this.s.bites.length >= this.opts.maxBites && this.progressBites === null;
    if (maxed) return this.regrow();
    this.play([
      { frames: 2, set: { headDY: 1, bodyDY: -1, mouth: 'w' } },
      { frames: 2, set: { headDY: 1, bodyDY: -1, mouth: 'open' } },
      { frames: 2, set: { headDY: 0, bodyDY: 0, mouth: 'chew' }, run: () => this.bite() },
      { frames: 2, set: { mouth: 'w' } },
      { frames: 2, set: { mouth: 'chew' } },
      { frames: 2, set: { mouth: 'w' } },
      { frames: 2, set: { mouth: 'chew' } },
      { frames: 6, set: { mouth: 'w', eyes: 'happy' } },
      { frames: 1, set: { eyes: 'open' } },
    ]);
  }

  bite() {
    const next = BITE_ORDER.find((b) => !this.s.bites.includes(b));
    if (next === undefined) return;
    this.s.bites.push(next);
    const [mx, my] = layout.melon;
    for (let i = 0; i < 5; i++) {
      this.s.crumbs.push({
        x: mx + next + Math.random() * 2 - 1,
        y: my + this.s.bodyDY,
        vx: (Math.random() - 0.5) * 1.6,
        vy: -1.2 - Math.random() * 1.1,
        c: ['r', 'R', 's', 'r'][i % 4],
        life: 14,
      });
    }
  }

  regrow() {
    const steps = [{ frames: 3, set: { eyes: 'happy', headDY: -1, bodyDY: -1 }, run: () => this.burst(6) }];
    this.s.bites.slice().forEach(() => steps.push({ frames: 2, run: () => this.s.bites.pop() }));
    steps.push({ frames: 4, set: { headDY: 0, bodyDY: 0 } }, { frames: 1, set: { eyes: 'open' } });
    this.play(steps);
  }

  pop() {
    if (this.busy) return;
    this.play([
      { frames: 2, set: { headDY: -1, bodyDY: -1, eyes: 'happy' }, run: () => this.burst(4) },
      { frames: 2, set: { headDY: -2, bodyDY: -1 } },
      { frames: 2, set: { headDY: -1, bodyDY: 0 } },
      { frames: 4, set: { headDY: 0, bodyDY: 0 } },
      { frames: 1, set: { eyes: 'open' } },
    ]);
  }

  celebrate() {
    return new Promise((resolve) => {
      this.play([
        { frames: 2, set: { eyes: 'happy', headDY: -1, bodyDY: -1, mouth: 'w' }, run: () => this.burst(10) },
        { frames: 2, set: { headDY: -2 } },
        { frames: 2, set: { headDY: -1, bodyDY: 0 } },
        { frames: 3, set: { headDY: 0 } },
        { frames: 1, run: resolve },
      ]);
    });
  }

  /** loader mode: 0..1 progress maps to bites taken out of the slice */
  setProgress(p) {
    this.progressBites = Math.round(Math.min(1, Math.max(0, p)) * BITE_ORDER.length);
  }

  burst(n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 8;
      this.s.bursts.push({
        x: Math.round(22 + Math.cos(a) * r),
        y: Math.round(16 + Math.sin(a) * r * 0.75),
        t: -Math.floor(Math.random() * 4),
        c: Math.random() > 0.5 ? 'x' : 'y',
      });
    }
  }

  /* ------------------------------------------------------------ simulation */
  tick() {
    const s = this.s;
    this.frame++;

    // sequence
    if (this.queue.length) {
      const step = this.queue[0];
      if (step.left === step.frames) {
        if (step.set) Object.assign(s, step.set);
        if (step.run) step.run();
      }
      if (--step.left <= 0) this.queue.shift();
    } else if (this.opts.autoplay) {
      // idle bob every 6 frames
      s.bob = Math.floor(this.frame / 6) % 2;
      if (--this.timers.blink <= 0) {
        this.play([{ frames: 2, set: { eyes: 'blink' } }, { frames: 1, set: { eyes: 'open' } }]);
        this.timers.blink = this.rand(25, 60);
      }
      if (--this.timers.ear <= 0) {
        const side = Math.random() > 0.5 ? 'earL' : 'earR';
        this.play([{ frames: 2, set: { [side]: 1 } }, { frames: 1, set: { [side]: 0 } }, { frames: 2, set: { [side]: 1 } }, { frames: 1, set: { [side]: 0 } }]);
        this.timers.ear = this.rand(40, 100);
      }
      if (this.opts.nibble && --this.timers.nibble <= 0) {
        this.nibble();
        this.timers.nibble = this.rand(55, 110);
      }
    }
    if (this.progressBites !== null && !this.queue.length && s.bites.length < this.progressBites) {
      this.nibble();
    }

    // eyes follow the pointer
    if (this.opts.track && pointer.active && s.eyes === 'open') {
      const r = this.opts.rect ? this.opts.rect() : this.canvas.getBoundingClientRect();
      const dx = pointer.x - (r.left + r.width / 2);
      const dy = pointer.y - (r.top + r.height * 0.35);
      s.eyeDX = Math.abs(dx) < r.width * 0.25 ? 0 : Math.sign(dx);
      s.eyeDY = dy < -r.height * 0.5 ? -1 : dy > r.height * 0.6 ? 1 : 0;
    } else if (!pointer.active) {
      s.eyeDX = 0;
      s.eyeDY = 0;
    }

    // crumbs
    s.crumbs = s.crumbs.filter((c) => {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.35;
      return --c.life > 0 && c.y < H;
    });
    // bursts
    s.bursts = s.bursts.filter((b) => ++b.t < 8);
  }

  /* ------------------------------------------------------------ drawing */
  stamp(rows, ox, oy, override, clip) {
    const buf = this.buf;
    for (let y = 0; y < rows.length; y++) {
      const r = rows[y];
      const py = oy + y;
      if (py < 0 || py >= H) continue;
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === '.') continue;
        if (clip && !clip(x, y)) continue;
        const px = ox + x;
        if (px < 0 || px >= W) continue;
        buf[py * W + px] = COLORS[override || ch];
      }
    }
  }

  dot(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < W && y >= 0 && y < H) this.buf[y * W + x] = COLORS[c];
  }

  render() {
    const s = this.s;
    this.buf.fill(0);
    const bob = s.bob;
    const hy = layout.head[1] + bob + s.headDY;
    const hx = layout.head[0];
    const by = bob + s.bodyDY;

    // pocket (static)
    this.stamp(sprite.pocket, ...layout.pocket);

    // head: ears drawn separately so they can twitch
    const head = sprite.head;
    const earRows = head.slice(0, 4);
    this.stamp(head.slice(4), hx, hy + 4);
    this.stamp(earRows, hx, hy + s.earL, null, (x) => x < 13);
    this.stamp(earRows, hx, hy + s.earR, null, (x) => x >= 13);

    // whiskers
    for (const wy of layout.whiskers) {
      this.stamp(['kkk'], hx - 2, hy + wy);
      this.stamp(['kkk'], hx + 25, hy + wy);
    }

    // eyes
    const eye = sprite.eyes[s.eyes];
    const eOff = s.eyes === 'happy' ? -1 : 0;
    for (const [ex, ey] of layout.eyes) {
      const dx = s.eyes === 'open' ? s.eyeDX : 0;
      const dy = s.eyes === 'open' ? s.eyeDY : 0;
      this.stamp(eye, hx + ex + eOff + dx, hy + ey + dy);
    }
    // mouth
    this.stamp(sprite.mouth[s.mouth], hx + layout.mouth[0], hy + layout.mouth[1]);

    // melon with bites
    const [mx, my] = layout.melon;
    const bites = s.bites;
    this.stamp(sprite.melon, mx, my + by, null, (x, y) => {
      for (const b of bites) {
        if (y === 0 && x >= b - 1 && x <= b + 2) return false;
        if (y === 1 && x >= b && x <= b + 1) return false;
      }
      return true;
    });

    // paws
    this.stamp(sprite.paw, layout.paws[0][0], layout.paws[0][1] + by);
    this.stamp(sprite.pawR, layout.paws[1][0], layout.paws[1][1] + by);

    // sparkles twinkle
    layout.sparkles.forEach((sp, i) => {
      const size = SPARKLE_CYCLE[Math.floor(this.frame / 3 + i * 3) % SPARKLE_CYCLE.length];
      if (!size) return;
      const cx = sp.x + (sp.size === 'big' ? 2 : 1);
      const cy = sp.y + (sp.size === 'big' ? 2 : 1);
      const want = sp.size === 'mid' && size === 'big' ? 'mid' : size;
      const g = sprite.sparkles[want];
      const half = (g.length - 1) / 2;
      this.stamp(g, cx - half, cy - half, sp.color);
    });

    // transient sparkles
    for (const b of s.bursts) {
      if (b.t < 0) continue;
      const size = b.t < 2 ? 'dot' : b.t < 5 ? 'mid' : 'dot';
      const g = sprite.sparkles[size];
      const half = (g.length - 1) / 2;
      this.stamp(g, b.x - half, b.y - half, b.c);
    }
    // crumbs
    for (const c of s.crumbs) this.dot(c.x, c.y, c.c);

    this.offCtx.putImageData(this.img, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.off, 0, 0, this.canvas.width, this.canvas.height);
  }

  loop(now) {
    if (this.dead) return;
    requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const dt = Math.min(200, now - (this.last || now));
    this.last = now;
    this.acc += dt;
    const step = 1000 / this.opts.fps;
    let changed = false;
    while (this.acc >= step) {
      this.acc -= step;
      this.tick();
      changed = true;
    }
    if (changed) this.render();
  }

  /** advance by dt ms when used in manual mode; returns true if the buffer changed */
  step(dt) {
    this.acc += Math.min(200, dt);
    const stepMs = 1000 / this.opts.fps;
    let changed = false;
    while (this.acc >= stepMs) {
      this.acc -= stepMs;
      this.tick();
      changed = true;
    }
    if (changed) this.render();
    return changed;
  }

  destroy() {
    this.dead = true;
    this.ro.disconnect();
    this.io.disconnect();
  }
}

/** Draw the static mark into any 2D context (used by the page transition). */
let staticCanvas;
export function drawStaticCat(ctx, x, y, scale) {
  if (!staticCanvas) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const tmp = new PixelCat(c, { autoplay: false, interactive: false, track: false });
    tmp.destroy();
    staticCanvas = tmp.off;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staticCanvas, Math.round(x), Math.round(y), W * scale, H * scale);
}

export const CAT_SIZE = { w: W, h: H };

/** The static mark as a flat list of hex colours (null = empty), row-major W×H. */
export function getCatPixels() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const tmp = new PixelCat(c, { autoplay: false, interactive: false, track: false });
  tmp.destroy();
  const data = tmp.img.data;
  const out = [];
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3];
    out.push(a ? '#' + [0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, '0')).join('') : null);
  }
  return out;
}
