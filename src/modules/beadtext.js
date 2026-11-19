import { makeBead } from './beadhero.js';
import { pointer, reduced } from './env.js';

/**
 * BeadText: a word set in the brand's pixel font, rebuilt as fuse beads.
 * Beads pour in column by column when the word scrolls into view, then part
 * and lift under the cursor and spring back.
 *
 *   new BeadText(el, { text: 'Pocketmelon', splitAt: 6 })
 *   → letters before `splitAt` use colors[0], the rest colors[1]
 */
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export class BeadText {
  constructor(el, { text, splitAt = text.length, colors = ['#efebe3', '#ff4f3f'], font = '"Pixelify Sans Variable"', weight = 600, px = 22 } = {}) {
    this.el = el;
    this.text = text;
    this.splitAt = splitAt;
    this.rgb = colors.map(hex);
    this.fontSpec = `${weight} ${px}px ${font}`;
    this.px = px;
    this.beads = [];
    this.sprites = [];
    this.started = false;
    this.visible = false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bead-text';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    this.frame = this.frame.bind(this);
    this.layout = this.layout.bind(this);
    document.fonts.load(this.fontSpec).then(() => this.init());
  }

  init() {
    this.bitmap();
    if (!this.cols) return;
    this.el.classList.add('is-beaded');
    this.el.appendChild(this.canvas);
    this.layout();
    new ResizeObserver(this.layout).observe(this.el);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible && !this.started) this.start();
    }, { threshold: 0.15 }).observe(this.el);
    if (reduced) {
      this.started = true;
      this.t0 = -1e6;
      this.draw(0);
    } else requestAnimationFrame(this.frame);
  }

  /** rasterise the word at 1px per bead and keep the solid pixels */
  bitmap() {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = this.fontSpec;
    const full = Math.ceil(g.measureText(this.text).width) + 2;
    const splitX = g.measureText(this.text.slice(0, this.splitAt)).width;
    const h = Math.ceil(this.px * 1.3);
    c.width = full;
    c.height = h;
    g.font = this.fontSpec;
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#000';
    g.fillText(this.text, 1, Math.round(this.px * 0.98));
    const d = g.getImageData(0, 0, full, h).data;
    let minY = h, maxY = 0, minX = full, maxX = 0;
    const on = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < full; x++) {
      if (d[(y * full + x) * 4 + 3] > 140) {
        on.push([x, y]);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (!on.length) return;
    this.cols = maxX - minX + 1;
    this.rows = maxY - minY + 1;
    this.beads = on.map(([x, y]) => ({
      cx: x - minX, cy: y - minY, c: x < splitX ? 0 : 1,
      ox: 0, oy: 0, vx: 0, vy: 0, lift: 0,
      delay: 0, drop: 0,
    }));
  }

  layout() {
    const cs = getComputedStyle(this.el);
    const w = this.el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.pitch = w / this.cols;
    const h = Math.ceil(this.pitch * (this.rows + 1.2));
    this.el.style.height = `${h}px`;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const size = Math.max(4, Math.ceil(this.pitch * this.dpr));
    this.sprites = this.rgb.map((c) => makeBead(c, size));
    this.shadow = (() => {
      const s = Math.ceil(size * 1.6);
      const cv = document.createElement('canvas');
      cv.width = cv.height = s;
      const gg = cv.getContext('2d');
      const gr = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(0,0,0,.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      gg.fillStyle = gr;
      gg.fillRect(0, 0, s, s);
      return cv;
    })();
    if (reduced && this.started) this.draw(0);
  }

  start() {
    this.started = true;
    this.t0 = performance.now();
    for (const b of this.beads) {
      b.delay = (b.cx / this.cols) * 1100 + Math.random() * 260;
      b.drop = this.pitch * (8 + Math.random() * 10);
    }
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    if (!this.visible || !this.started) return;
    const dt = Math.min(64, now - (this.last || now));
    this.last = now;
    const k = dt / 16.67;
    const r = this.canvas.getBoundingClientRect();
    const px = pointer.x - r.left, py = pointer.y - r.top;
    const R = this.pitch * 6;
    const P = this.pitch;
    for (const b of this.beads) {
      let tx = 0, ty = 0, tl = 0;
      if (pointer.active) {
        const hx = (b.cx + 0.5) * P, hy = (b.cy + 0.6) * P;
        const dx = hx - px, dy = hy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = 1 - d / R;
          tx = (dx / d) * f * f * P * 1.5;
          ty = (dy / d) * f * f * P * 1.5;
          tl = f;
        }
      }
      b.vx = (b.vx + (tx - b.ox) * 0.14 * k) * Math.pow(0.74, k);
      b.vy = (b.vy + (ty - b.oy) * 0.14 * k) * Math.pow(0.74, k);
      b.ox += b.vx * k;
      b.oy += b.vy * k;
      b.lift += (tl - b.lift) * 0.18 * k;
    }
    this.draw(now);
  }

  draw(now) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const P = this.pitch * dpr;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const el = now - this.t0;
    const SH = this.shadow.width;
    const list = [];
    for (const b of this.beads) {
      let x = (b.cx + 0.5) * P + b.ox * dpr;
      let y = (b.cy + 0.6) * P + b.oy * dpr;
      let s = 1, a = 1;
      if (!reduced) {
        const u = Math.min(1, Math.max(0, (el - b.delay) / 650));
        if (u <= 0) continue;
        const e = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
        y -= (1 - e) * b.drop * dpr;
        a = Math.min(1, u * 2.5);
      }
      s *= 1 + b.lift * 0.25;
      list.push([x, y, s, a, b]);
    }
    for (const [x, y, s, a, b] of list) {
      ctx.globalAlpha = a * (1 - b.lift * 0.3);
      const ss = SH * s;
      ctx.drawImage(this.shadow, x - ss / 2, y - ss / 2 + P * (0.18 + b.lift * 0.4), ss, ss);
    }
    for (const [x, y, s, a, b] of list) {
      ctx.globalAlpha = a;
      const bs = P * s;
      ctx.drawImage(this.sprites[b.c], x - bs / 2, y - bs / 2 - b.lift * P * 0.25, bs, bs);
    }
    ctx.globalAlpha = 1;
  }
}
