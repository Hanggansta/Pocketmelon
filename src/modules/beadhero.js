import { PixelCat, CAT_SIZE } from './pixelcat.js';
import sprite from './cat-sprite.json';
import { pointer, reduced } from './env.js';

/**
 * BeadHero: the mascot rebuilt from ~1,100 physical fuse beads.
 *
 * A PixelCat runs headless in "manual" mode and its 44×44 buffer is used as a
 * live colour map: every pixel is a bead. Beads pour in and snap into place,
 * flip when their colour changes (blinks, eye tracking), part under the cursor,
 * fall off the slice when the cat takes a bite, and fly into the header logo
 * as you scroll ("into the pocket"), each landing on its matching logo pixel.
 */
const N = CAT_SIZE.w;
const M = CAT_SIZE.h;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const LOOSE_COLORS = ['#f26b5b', '#7a9a52', '#f4c9a0', '#fbf3e4', '#3b2f2a', '#e9a6a1', '#5b7fbf', '#f2c14e'];

const rgbOf = (u32) => [u32 & 255, (u32 >> 8) & 255, (u32 >> 16) & 255];
const hexToRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function makeBead(rgb, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const light = mix(rgb, [255, 255, 255], 0.38);
  const dark = mix(rgb, [20, 14, 10], 0.32);
  const grad = g.createRadialGradient(r * 0.68, r * 0.58, r * 0.08, r, r, r);
  grad.addColorStop(0, css(light));
  grad.addColorStop(0.5, css(rgb));
  grad.addColorStop(1, css(dark));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r * 0.94, 0, TAU);
  g.fill();
  // the hole
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(r, r, r * 0.3, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = css(dark, 0.6);
  g.lineWidth = Math.max(1, size * 0.045);
  g.beginPath();
  g.arc(r, r, r * 0.33, 0, TAU);
  g.stroke();
  // specular
  g.fillStyle = 'rgba(255,255,255,.42)';
  g.beginPath();
  g.ellipse(r * 0.6, r * 0.42, r * 0.24, r * 0.1, -0.55, 0, TAU);
  g.fill();
  return c;
}

function makeShadow(size) {
  const s = Math.ceil(size * 1.7);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(48,34,20,.34)');
  grad.addColorStop(0.45, 'rgba(48,34,20,.16)');
  grad.addColorStop(1, 'rgba(48,34,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

export class BeadHero {
  /**
   * @param {HTMLElement} stage   element whose box the cat fills (square)
   * @param {object} o
   * @param {HTMLElement} o.hero  the hero section (scroll range + loose beads area)
   * @param {HTMLElement} [o.logo] header logo cat element; beads fly into it
   */
  constructor(stage, { hero, logo } = {}) {
    this.stage = stage;
    this.hero = hero;
    this.logo = logo;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bead-hero';
    this.canvas.setAttribute('aria-hidden', 'true');
    hero.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.cat = new PixelCat(document.createElement('canvas'), {
      manual: true,
      nibble: true,
      maxBites: 4,
      rect: () => this.stage.getBoundingClientRect(),
    });
    this.beads = [];
    for (let i = 0; i < N * M; i++) {
      this.beads.push({
        i, cx: i % N, cy: Math.floor(i / N),
        col: 0, next: 0, flip: 0, appear: 0, gone: 0,
        ox: 0, oy: 0, vx: 0, vy: 0, lift: 0,
        delay: 0, drop: 0, fly: Math.random() * 0.22, swirl: (Math.random() - 0.5) * 2,
      });
    }
    this.falling = [];
    this.loose = [];
    this.sprites = new Map();
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
    this.measure();
    this.sync(true);

    stage.addEventListener('click', (e) => this.poke(e.clientX, e.clientY, true));
    hero.addEventListener('pointerdown', (e) => {
      if (!stage.contains(e.target)) this.poke(e.clientX, e.clientY, false);
    });

    if (reduced) {
      this.beads.forEach((b) => (b.appear = b.col ? 1 : 0));
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
    if (Math.abs(size / N - (this.pitch || 0)) > 0.25) this.loose = [];
    this.pitch = size / N;
    this.sx = r.left + (r.width - size) / 2;
    this.sy = r.top + scrollY + (r.height - size) / 2; // page coords
    this.heroTop = this.hero.offsetTop;
    this.heroH = this.hero.offsetHeight;
    this.sprites.clear();
    this.shadow = makeShadow(Math.ceil(this.pitch * dpr));
    if (!this.loose.length) this.seedLoose();
    if (reduced) this.draw(performance.now());
  }

  seedLoose() {
    const count = innerWidth < 700 ? 12 : 30;
    const cx = this.sx + (N * this.pitch) / 2;
    const cy = this.sy + (M * this.pitch) / 2;
    const R = N * this.pitch * 0.5;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const d = R * (1.02 + Math.random() * 0.5);
      this.loose.push({
        x: cx + Math.cos(a) * d * 1.1,
        y: cy + Math.sin(a) * d * 0.95,
        vx: 0, vy: 0, lift: 0,
        rgb: hexToRgb(LOOSE_COLORS[k % LOOSE_COLORS.length]),
        key: 'L' + (k % LOOSE_COLORS.length),
      });
    }
    // keep loose beads inside the hero and off the left text column on desktop
    const minX = innerWidth > 900 ? innerWidth * 0.6 : 12;
    const top = this.sy - this.pitch * 2;
    const bottom = this.sy + M * this.pitch + this.pitch * 3;
    this.loose.forEach((l) => {
      l.x = clamp(l.x, minX, innerWidth - 16);
      l.y = clamp(l.y, top, bottom);
    });
  }

  spriteFor(key, rgb) {
    let s = this.sprites.get(key);
    if (!s) {
      s = makeBead(rgb, Math.max(4, Math.ceil(this.pitch * this.dpr)));
      this.sprites.set(key, s);
    }
    return s;
  }

  setLogo(v) {
    if (this.logo) this.logo.style.opacity = String(v);
  }

  /* ----------------------------------------------------------- control */
  start() {
    if (this.started) return;
    this.started = true;
    this.t0 = performance.now();
    // build up from the bottom row, with a little scatter
    for (const b of this.beads) {
      b.delay = ((M - 1 - b.cy) / M) * 900 + Math.random() * 380;
      b.drop = innerHeight * (0.35 + Math.random() * 0.35);
    }
  }

  poke(x, y, onCat) {
    // shockwave
    const R = this.pitch * 16;
    for (const b of this.beads) {
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
    for (const l of this.loose) {
      const dx = l.x - x, dy = l.y - scrollY - y;
      const d = Math.hypot(dx, dy);
      if (d < R * 1.4) {
        const f = (1 - d / (R * 1.4)) * 14;
        l.vx += (dx / (d || 1)) * f;
        l.vy += (dy / (d || 1)) * f;
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

  floorY() {
    return this.sy + M * this.pitch + this.pitch * 2.5;
  }

  inMelon(b) {
    const m = this.melon;
    return b.cx >= m.x && b.cx < m.x + m.w && b.cy >= m.y - 1 && b.cy < m.y + 3;
  }

  sync(initial = false) {
    const buf = this.cat.buf;
    for (const b of this.beads) {
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
          const [x, y] = this.home(b);
          this.falling.push({
            x: x + b.ox, y: y + b.oy + scrollY, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3,
            col: b.col, life: 90, bounce: 0,
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
    this.canvas.classList.toggle('is-flying', this.p > 0.02);
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

    for (const b of this.beads) {
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

    // loose beads on the table: pushed, slide with friction
    for (const l of this.loose) {
      if (active) {
        const dx = l.x - px, dy = l.y - scrollY - py;
        const d = Math.hypot(dx, dy);
        if (d < R) {
          const f = 1 - d / R;
          l.vx += (dx / (d || 1)) * f * 1.4 + pvx * f * 0.12;
          l.vy += (dy / (d || 1)) * f * 1.4 + pvy * f * 0.12;
          l.lift = Math.max(l.lift, f);
        }
      }
      l.vx *= Math.pow(0.9, k);
      l.vy *= Math.pow(0.9, k);
      l.x += l.vx * k;
      l.y += l.vy * k;
      l.lift *= Math.pow(0.9, k);
      const minY = this.heroTop + 70, maxY = this.heroTop + this.heroH - 12;
      if (l.x < 8 || l.x > innerWidth - 8) { l.vx *= -0.6; l.x = clamp(l.x, 8, innerWidth - 8); }
      if (l.y < minY || l.y > maxY) { l.vy *= -0.6; l.y = clamp(l.y, minY, maxY); }
    }

    // beads knocked off the slice: gravity + a bounce on the hero floor
    const floor = this.floorY();
    this.falling = this.falling.filter((f) => {
      f.vy += 0.42 * k;
      f.x += f.vx * k;
      f.y += f.vy * k;
      if (f.y > floor && f.vy > 0) {
        f.y = floor;
        f.vy *= -0.42;
        f.vx *= 0.7;
        if (++f.bounce > 3) f.vy = 0;
      }
      f.life -= this.p > 0.02 ? 4 : 1; // once the page moves, crumbs are swept away fast
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
    const shadow = this.shadow;
    const SH = shadow.width;
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

    const items = [];
    for (const b of this.beads) {
      if (!b.col) continue;
      let [x, y] = this.home(b);
      let scale = 1;
      let alpha = 1;
      // intro: drop in with a little overshoot
      if (!reduced && this.t0) {
        const u = clamp((el - b.delay) / 720);
        if (u <= 0) continue;
        y -= (1 - easeOutBack(u)) * b.drop;
        scale *= 0.7 + 0.3 * u;
        alpha = Math.min(1, u * 2.5);
      }
      x += b.ox;
      y += b.oy;
      // fly into the pocket
      let t = 0;
      if (this.p > 0 && lp) {
        t = easeInOut(clamp((this.p - b.fly) / 0.6));
        if (t > 0) {
          const tx = lx + (b.cx + 0.5) * lp;
          const ty = ly + (b.cy + 0.5) * lp;
          const mx = x + (tx - x) * t;
          const my = y + (ty - y) * t;
          const arc = Math.sin(Math.PI * t);
          x = mx + b.swirl * arc * this.pitch * 9;
          y = my - arc * this.pitch * 6;
          scale *= 1 + (lp / this.pitch - 1) * t;
        }
      }
      if (b.appear > 0 && b.appear < 1) scale *= easeOutBack(b.appear);
      if (b.gone) scale *= b.gone;
      const lift = b.lift * (1 - t);
      items.push({ x, y, scale: scale * (1 + lift * 0.22), sx: b.flip > 0 ? Math.abs(b.flip * 2 - 1) : 1, alpha, lift, col: b.col, t });
    }

    // shadows
    for (const it of items) {
      if (it.t > 0.6) continue;
      const s = SH * it.scale * (1 + it.lift * 0.4);
      const off = (0.16 + it.lift * 0.5) * P * (1 - it.t);
      ctx.globalAlpha = it.alpha * (1 - it.lift * 0.35) * (1 - it.t);
      ctx.drawImage(shadow, it.x * dpr - s / 2, it.y * dpr - s / 2 + off, s, s);
    }
    // loose beads (table)
    for (const l of this.loose) {
      const y = l.y - scrollY;
      if (y < -40 || y > innerHeight + 40) continue;
      const s = SH * (1 + l.lift * 0.3);
      ctx.globalAlpha = 0.9 * (this.t0 ? clamp((el - 900) / 600) : 1) * clamp(1 - this.p * 2.5);
      ctx.drawImage(shadow, l.x * dpr - s / 2, y * dpr - s / 2 + P * 0.18, s, s);
      const spr = this.spriteFor(l.key, l.rgb);
      const bs = P * (1 + l.lift * 0.15);
      ctx.drawImage(spr, l.x * dpr - bs / 2, y * dpr - bs / 2 - l.lift * P * 0.2, bs, bs);
    }
    // cat beads
    for (const it of items) {
      const spr = this.spriteFor(it.col, rgbOf(it.col));
      const w = P * it.scale * it.sx;
      const h = P * it.scale;
      ctx.globalAlpha = it.alpha;
      ctx.drawImage(spr, it.x * dpr - w / 2, it.y * dpr - h / 2 - it.lift * P * 0.25, w, h);
    }
    // knocked-off beads
    ctx.globalAlpha = 1;
    for (const f of this.falling) {
      const y = f.y - scrollY;
      const spr = this.spriteFor(f.col, rgbOf(f.col));
      const a = Math.min(1, f.life / 30) * clamp(1 - this.p * 6);
      const fy = (this.floorY() - scrollY) * dpr;
      const near = clamp(1 - (fy - y * dpr) / (P * 8));
      ctx.globalAlpha = a * near;
      ctx.drawImage(shadow, f.x * dpr - SH / 2, fy - SH / 2 + P * 0.2, SH, SH);
      ctx.globalAlpha = a;
      ctx.drawImage(spr, f.x * dpr - P / 2, y * dpr - P / 2, P, P);
    }
    ctx.globalAlpha = 1;
  }
}
