import { PixelCat, CAT_SIZE } from './pixelcat.js';
import sprite from './cat-sprite.json';
import { pointer, reduced } from './env.js';

/**
 * PixelHero: the mascot as a live artboard of ~1,900 screen pixels.
 *
 * A PixelCat runs headless in "manual" mode and its 44×44 buffer is used as a
 * live colour map. Pixels assemble out of noise on load, flip when their colour
 * changes (blinks, eye tracking), part under the cursor, ripple on click, break
 * off the slice when the cat takes a bite, and fly into the header logo as you
 * scroll, each landing on its matching logo pixel.
 */
const N = CAT_SIZE.w;
const M = CAT_SIZE.h;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const cssOf = (u32) => `rgb(${u32 & 255},${(u32 >> 8) & 255},${(u32 >> 16) & 255})`;
const GAP = 0.9; // drawn size as a share of the pitch: a hairline grid between pixels

export class PixelHero {
  /**
   * @param {HTMLElement} stage   element whose box the cat fills (square)
   * @param {object} o
   * @param {HTMLElement} o.hero  the hero section (scroll range)
   * @param {HTMLElement} [o.logo] header logo cat element; pixels fly into it
   */
  constructor(stage, { hero, logo } = {}) {
    this.stage = stage;
    this.hero = hero;
    this.logo = logo;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pixel-hero';
    this.canvas.setAttribute('aria-hidden', 'true');
    hero.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.cat = new PixelCat(document.createElement('canvas'), {
      manual: true,
      nibble: true,
      maxBites: 4,
      rect: () => this.stage.getBoundingClientRect(),
    });
    this.px = [];
    for (let i = 0; i < N * M; i++) {
      const a = Math.random() * Math.PI * 2;
      this.px.push({
        i, cx: i % N, cy: Math.floor(i / N),
        col: 0, next: 0, flip: 0, appear: 0, gone: 0,
        ox: 0, oy: 0, vx: 0, vy: 0, lift: 0,
        delay: 0, sa: Math.cos(a), sb: Math.sin(a), sd: 0,
        fly: Math.random() * 0.22, swirl: (Math.random() - 0.5) * 2,
      });
    }
    this.falling = [];
    this.colors = new Map();
    this.started = false;
    this.t0 = 0;
    this.last = 0;
    this.p = 0;
    this.lastP = -1;
    this.prevPointer = { x: pointer.x, y: pointer.y };
    this.melon = { x: sprite.layout.melon[0], y: sprite.layout.melon[1], w: sprite.melon[0].length, h: sprite.melon.length };

    this.measure = this.measure.bind(this);
    this.frame = this.frame.bind(this);
    window.addEventListener('resize', this.measure);
    new ResizeObserver(this.measure).observe(stage);
    this.sync(true);
    this.bbox = this.bounds();
    this.measure();

    stage.addEventListener('click', (e) => this.poke(e.clientX, e.clientY, true));
    hero.addEventListener('pointerdown', (e) => {
      if (!stage.contains(e.target)) this.poke(e.clientX, e.clientY, false);
    });

    if (reduced) {
      this.px.forEach((b) => (b.appear = b.col ? 1 : 0));
      this.started = true;
      this.draw(performance.now());
    } else {
      this.setLogo(0);
      requestAnimationFrame(this.frame);
    }
  }

  /* ----------------------------------------------------------- layout */
  measure() {
    const dpr = (this.dpr = Math.min(window.devicePixelRatio || 1, 2));
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    const r = this.stage.getBoundingClientRect();
    const size = Math.min(r.width, r.height || r.width);
    this.pitch = size / N;
    this.sx = r.left + (r.width - size) / 2;
    this.sy = r.top + scrollY + (r.height - size) / 2; // page coords
    this.heroTop = this.hero.offsetTop;
    this.heroH = this.hero.offsetHeight;
    this.onMeasure?.(this);
    if (reduced) this.draw(performance.now());
  }

  /** pixel bounds of the artwork in grid cells, for a selection frame that hugs the layer */
  bounds() {
    let x0 = N, y0 = M, x1 = 0, y1 = 0;
    for (const b of this.px) {
      if (!b.col) continue;
      x0 = Math.min(x0, b.cx); y0 = Math.min(y0, b.cy);
      x1 = Math.max(x1, b.cx); y1 = Math.max(y1, b.cy);
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  color(u32) {
    let c = this.colors.get(u32);
    if (!c) this.colors.set(u32, (c = cssOf(u32)));
    return c;
  }

  setLogo(v) {
    if (this.logo) this.logo.style.opacity = String(v);
  }

  /* ----------------------------------------------------------- control */
  start() {
    if (this.started) return;
    this.started = true;
    this.t0 = performance.now();
    // assemble out of noise in a diagonal sweep, like a progressive render
    for (const b of this.px) {
      b.delay = ((b.cx + b.cy) / (N + M)) * 820 + Math.random() * 300;
      b.sd = this.pitch * (2 + Math.random() * 7);
    }
  }

  poke(x, y, onCat) {
    // ripple
    const R = this.pitch * 16;
    for (const b of this.px) {
      if (!b.col) continue;
      const [bx, by] = this.home(b);
      const dx = bx - x, dy = by - y;
      const d = Math.hypot(dx, dy);
      if (d < R) {
        const f = (1 - d / R) * this.pitch * 0.9;
        b.vx += (dx / (d || 1)) * f;
        b.vy += (dy / (d || 1)) * f;
        b.lift = Math.min(1, b.lift + (1 - d / R));
      }
    }
    if (onCat && !reduced) this.cat.nibble();
  }

  nibble() {
    this.cat.nibble();
  }

  /* ----------------------------------------------------------- sim */
  home(b) {
    return [this.sx + (b.cx + 0.5) * this.pitch, this.sy + (b.cy + 0.5) * this.pitch - scrollY];
  }

  inMelon(b) {
    const m = this.melon;
    return b.cx >= m.x && b.cx < m.x + m.w && b.cy >= m.y - 1 && b.cy < m.y + 3;
  }

  sync(initial = false) {
    const buf = this.cat.buf;
    for (const b of this.px) {
      const v = buf[b.i] >>> 0;
      const cur = b.flip > 0 ? b.next : b.col;
      if (v === cur) continue;
      if (initial) {
        b.col = v;
        continue;
      }
      if (!b.col && v) {
        b.col = v;
        b.appear = 0.001;
      } else if (b.col && !v) {
        if (this.inMelon(b) && this.started && this.p < 0.05) {
          // bitten pixels break off and tumble away
          const [x, y] = this.home(b);
          this.falling.push({
            x: x + b.ox, y: y + b.oy + scrollY, vx: (Math.random() - 0.5) * 2.4, vy: -1.5 - Math.random() * 2.5,
            col: b.col, life: 46, spin: (Math.random() - 0.5) * 0.3, a: 0,
          });
          b.col = 0;
          b.appear = 0;
        } else {
          b.gone = 1;
        }
      } else {
        b.next = v;
        b.flip = 1;
      }
    }
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(64, now - (this.last || now));
    this.last = now;

    // scroll progress through the hero: 0 = resting, 1 = in the pocket
    const range = Math.max(1, this.heroH * 0.82);
    this.p = clamp((scrollY - this.heroTop) / range);
    const inPocket = this.p >= 1 && !this.falling.length;
    if (inPocket) {
      if (this.lastP < 1) {
        this.canvas.style.visibility = 'hidden';
        this.setLogo(1);
        this.logo?._cat?.pop();
      }
      this.lastP = this.p;
      return;
    }
    if (this.lastP >= 1 || this.lastP < 0) this.canvas.style.visibility = 'visible';
    this.lastP = this.p;
    const moving = this.p > 0.02;
    if (moving !== this.moving) {
      this.moving = moving;
      this.canvas.classList.toggle('is-flying', moving);
      this.hero.classList.toggle('is-pocketing', moving);
    }
    this.setLogo(clamp((this.p - 0.86) / 0.12));

    if (this.started && this.cat.step(dt)) this.sync();
    this.simulate(dt);
    this.draw(now);
  }

  simulate(dt) {
    const k = dt / 16.67;
    const px = pointer.x, py = pointer.y;
    const pvx = px - this.prevPointer.x, pvy = py - this.prevPointer.y;
    this.prevPointer.x = px;
    this.prevPointer.y = py;
    const R = this.pitch * 7.5;
    const active = pointer.active && this.p < 0.3;

    for (const b of this.px) {
      if (!b.col && !b.gone) continue;
      let tx = 0, ty = 0, tl = 0;
      if (active) {
        const [hx, hy] = this.home(b);
        const dx = hx - px, dy = hy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = 1 - d / R;
          const push = f * f * this.pitch * 1.6;
          tx = (dx / d) * push;
          ty = (dy / d) * push;
          tl = f;
          b.vx += pvx * f * 0.05;
          b.vy += pvy * f * 0.05;
        }
      }
      b.vx += (tx - b.ox) * 0.14 * k;
      b.vy += (ty - b.oy) * 0.14 * k;
      b.vx *= Math.pow(0.74, k);
      b.vy *= Math.pow(0.74, k);
      b.ox += b.vx * k;
      b.oy += b.vy * k;
      b.lift += (tl - b.lift) * 0.18 * k;
      if (b.appear > 0 && b.appear < 1) b.appear = Math.min(1, b.appear + 0.12 * k);
      if (b.flip > 0) {
        const before = b.flip;
        b.flip = Math.max(0, b.flip - 0.16 * k);
        if (before > 0.5 && b.flip <= 0.5) b.col = b.next;
      }
      if (b.gone) {
        b.gone = Math.max(0, b.gone - 0.2 * k);
        if (!b.gone) b.col = 0;
      }
    }

    this.falling = this.falling.filter((f) => {
      f.vy += 0.32 * k;
      f.x += f.vx * k;
      f.y += f.vy * k;
      f.a += f.spin * k;
      f.life -= (this.p > 0.02 ? 4 : 1) * k;
      return f.life > 0;
    });
  }

  /* ----------------------------------------------------------- draw */
  draw(now) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.started) return;
    const P = this.pitch * dpr;
    const el = now - this.t0;

    // fly target: the header logo cat
    let lx = 0, ly = 0, lp = 0;
    if (this.logo && this.p > 0) {
      const r = this.logo.getBoundingClientRect();
      const s = Math.min(r.width, r.height);
      lp = s / N;
      lx = r.left + (r.width - s) / 2;
      ly = r.top + (r.height - s) / 2;
    }

    let lastCol = -1;
    for (const b of this.px) {
      if (!b.col) continue;
      let [x, y] = this.home(b);
      let scale = 1;
      let alpha = 1;
      // intro: converge out of scattered noise
      if (!reduced && this.t0) {
        const u = clamp((el - b.delay) / 680);
        if (u <= 0) continue;
        const e = easeOutExpo(u);
        x += b.sa * b.sd * (1 - e);
        y += b.sb * b.sd * (1 - e);
        scale *= 0.25 + 0.75 * e;
        alpha = Math.min(1, u * 3);
      }
      x += b.ox;
      y += b.oy;
      // fly into the pocket
      if (this.p > 0 && lp) {
        const t = easeInOut(clamp((this.p - b.fly) / 0.6));
        if (t > 0) {
          const tx = lx + (b.cx + 0.5) * lp;
          const ty = ly + (b.cy + 0.5) * lp;
          const arc = Math.sin(Math.PI * t);
          x = x + (tx - x) * t + b.swirl * arc * this.pitch * 9;
          y = y + (ty - y) * t - arc * this.pitch * 6;
          scale *= 1 + (lp / this.pitch - 1) * t;
        }
      }
      if (b.appear > 0 && b.appear < 1) scale *= easeOutBack(b.appear);
      if (b.gone) scale *= b.gone;
      scale *= 1 + b.lift * 0.28;
      const sx = b.flip > 0 ? Math.abs(b.flip * 2 - 1) : 1;
      const w = P * GAP * scale * sx;
      const h = P * GAP * scale;
      if (b.col !== lastCol) {
        ctx.fillStyle = this.color(b.col);
        lastCol = b.col;
      }
      ctx.globalAlpha = alpha;
      ctx.fillRect(x * dpr - w / 2, y * dpr - h / 2, w, h);
    }

    // bitten-off pixels
    for (const f of this.falling) {
      const y = (f.y - scrollY) * dpr;
      ctx.globalAlpha = Math.min(1, f.life / 20) * clamp(1 - this.p * 6);
      ctx.fillStyle = this.color(f.col);
      ctx.save();
      ctx.translate(f.x * dpr, y);
      ctx.rotate(f.a);
      ctx.fillRect(-P * GAP / 2, -P * GAP / 2, P * GAP, P * GAP);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
