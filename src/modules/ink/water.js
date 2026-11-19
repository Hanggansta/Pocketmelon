import { GL, HEAD, textMask } from '../gl/gl2.js';

/**
 * InkWater: ink dropped into still water, real time (WebGL2).
 *
 * Stable fluids (semi-Lagrangian advection, Jacobi pressure projection) with:
 *   - vorticity confinement, so plumes curl into the fine scrolls ink makes in water
 *   - buoyancy: ink is denser than water and sinks, so drops mushroom
 *   - curl-noise ambient currents, so the water is never dead still
 *   - glyph condensation: a non-solenoidal drift applied to the ink only (not the water)
 *     pulls ink into a character's shape while the flow keeps it smoking
 * Rendering: Beer–Lambert absorption (thin ink warm grey, dense ink blue-black), density-gradient
 * lighting for a volumetric read, a touch of chromatic aberration, vignette and film grain,
 * plus a scroll-driven "flood" that drowns the frame in ink for the cut.
 */

const CURL = HEAD + `
uniform sampler2D uVel; uniform vec2 uTx;
void main() {
  float L = texture(uVel, vUv - vec2(uTx.x, 0)).y, R = texture(uVel, vUv + vec2(uTx.x, 0)).y;
  float T = texture(uVel, vUv + vec2(0, uTx.y)).x, B = texture(uVel, vUv - vec2(0, uTx.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0, 0, 1);
}`;

const FORCES = HEAD + `
uniform sampler2D uVel, uCurl, uDye; uniform vec2 uTx;
uniform float uDt, uVort, uTime, uNoise, uBuoy, uAspect;
void main() {
  vec2 v = texture(uVel, vUv).xy;
  // vorticity confinement
  float L = texture(uCurl, vUv - vec2(uTx.x, 0)).x, R = texture(uCurl, vUv + vec2(uTx.x, 0)).x;
  float T = texture(uCurl, vUv + vec2(0, uTx.y)).x, B = texture(uCurl, vUv - vec2(0, uTx.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= uVort * C; f.y *= -1.0;
  v += f * uDt;
  // ambient curl-noise current (divergence-free by construction)
  vec2 q = vUv * vec2(uAspect, 1.0) * 2.2 + vec2(0.0, uTime * 0.03);
  float e = 0.02;
  float a = fbm(q + vec2(0, e)), b = fbm(q - vec2(0, e)), c = fbm(q + vec2(e, 0)), d = fbm(q - vec2(e, 0));
  v += vec2(a - b, -(c - d)) / (2.0 * e) * uNoise * uDt;
  // ink is heavier than water
  v.y -= uBuoy * texture(uDye, vUv).r * uDt;
  o = vec4(clamp(v, -1500.0, 1500.0), 0, 1);
}`;

const SPLAT = HEAD + `
uniform sampler2D uTarget; uniform vec2 uPoint; uniform vec4 uValue; uniform float uRadius, uAspect;
void main() {
  vec2 p = vUv - uPoint; p.x *= uAspect;
  float g = exp(-dot(p, p) / uRadius);
  o = texture(uTarget, vUv) + uValue * g;
}`;

const DIV = HEAD + `
uniform sampler2D uVel; uniform vec2 uTx;
void main() {
  vec2 C = texture(uVel, vUv).xy;
  float L = texture(uVel, vUv - vec2(uTx.x, 0)).x, R = texture(uVel, vUv + vec2(uTx.x, 0)).x;
  float T = texture(uVel, vUv + vec2(0, uTx.y)).y, B = texture(uVel, vUv - vec2(0, uTx.y)).y;
  if (vUv.x - uTx.x < 0.0) L = -C.x;
  if (vUv.x + uTx.x > 1.0) R = -C.x;
  if (vUv.y + uTx.y > 1.0) T = -C.y;
  if (vUv.y - uTx.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0, 0, 1);
}`;

const SCALE = HEAD + `
uniform sampler2D uTex; uniform float uK;
void main() { o = texture(uTex, vUv) * uK; }`;

const PRESSURE = HEAD + `
uniform sampler2D uP, uDiv; uniform vec2 uTx;
void main() {
  float L = texture(uP, vUv - vec2(uTx.x, 0)).x, R = texture(uP, vUv + vec2(uTx.x, 0)).x;
  float T = texture(uP, vUv + vec2(0, uTx.y)).x, B = texture(uP, vUv - vec2(0, uTx.y)).x;
  o = vec4((L + R + B + T - texture(uDiv, vUv).x) * 0.25, 0, 0, 1);
}`;

const GRAD = HEAD + `
uniform sampler2D uP, uVel; uniform vec2 uTx;
void main() {
  float L = texture(uP, vUv - vec2(uTx.x, 0)).x, R = texture(uP, vUv + vec2(uTx.x, 0)).x;
  float T = texture(uP, vUv + vec2(0, uTx.y)).x, B = texture(uP, vUv - vec2(0, uTx.y)).x;
  o = vec4(texture(uVel, vUv).xy - vec2(R - L, T - B), 0, 1);
}`;

const ADVECT_VEL = HEAD + `
uniform sampler2D uVel; uniform vec2 uTx; uniform float uDt, uDiss;
void main() {
  vec2 p = vUv - uDt * texture(uVel, vUv).xy * uTx;
  o = texture(uVel, p) / (1.0 + uDiss * uDt);
}`;

const ADVECT_DYE = HEAD + `
uniform sampler2D uVel, uDye, uMask, uField; uniform vec2 uTx, uFTx;
uniform float uDt, uDiss, uAttract, uSource, uTime, uGlyph, uEdge, uHalo;
void main() {
  vec2 v = texture(uVel, vUv).xy * uTx;
  vec2 drift = vec2(0.0);
  if (uGlyph > 0.5) {
    // climb the blurred glyph field: ink gathers into the character
    float fx = texture(uField, vUv + vec2(uFTx.x, 0)).a - texture(uField, vUv - vec2(uFTx.x, 0)).a;
    float fy = texture(uField, vUv + vec2(0, uFTx.y)).a - texture(uField, vUv - vec2(0, uFTx.y)).a;
    // only smoke outside the letters is pulled in; inside, ink stays put so thin strokes keep their shape
    float inside = smoothstep(0.15, 0.75, texture(uMask, vUv).a);
    drift = vec2(fx, fy) * uAttract * 1.1 * (1.0 - inside);
  }
  vec4 d = texture(uDye, vUv - uDt * (v + drift)) / (1.0 + uDiss * uDt);
  if (uGlyph > 0.5) {
    float m = texture(uMask, vUv).a;
    float breath = 0.55 + 0.9 * fbm(vUv * 9.0 + vec2(uTime * 0.25, -uTime * 0.18));
    d.r += m * uSource * uDt * breath;
    // inside the letters ink settles; outside it disperses a little faster
    d *= mix(1.0 - uEdge * uAttract * uDt, 1.0, smoothstep(0.0, 0.6, m + texture(uField, vUv).a * uHalo));
  }
  o = min(d, vec4(6.0));
}`;

const RENDER = HEAD + `
uniform sampler2D uDye; uniform vec2 uTx, uRes;
uniform float uTime, uFlood, uZoom, uGrain, uAspect, uVignette, uMode;
uniform vec3 uPaper, uInk, uK0, uK1, uK2, uK3;
// absorbance (mode 0, pigment in water on paper) or scattering (mode 1, milky pigment in black water)
vec3 A(vec4 d) { return d.r * uK0 + d.g * uK1 + d.b * uK2 + d.a * uK3; }
void main() {
  vec2 uv = (vUv - 0.5) / uZoom + 0.5;
  vec2 dir = uv - 0.5;
  float ca = 0.012 * dot(dir, dir);
  vec4 D = texture(uDye, uv);
  vec3 a = A(D);
  a.r = A(texture(uDye, uv + dir * ca)).r;
  a.b = A(texture(uDye, uv - dir * ca)).b;
  float dens = D.r + D.g + D.b + D.a;
  // the flood: ink drowns the frame, spreading out from where it already is
  float flood = 0.0;
  if (uFlood > 0.0) {
    float fl = fbm(uv * vec2(uAspect, 1.0) * 2.2 + vec2(uTime * 0.02, 0.0));
    flood = smoothstep(0.0, 0.18, uFlood * 1.5 - (1.0 - fl) * 0.9 - 0.12 + min(dens, 2.0) * 0.35 * uFlood);
  }
  // volumetric read from the density gradient
  float l = dot(texture(uDye, uv - vec2(uTx.x, 0)), vec4(1)), r = dot(texture(uDye, uv + vec2(uTx.x, 0)), vec4(1));
  float b = dot(texture(uDye, uv - vec2(0, uTx.y)), vec4(1)), t = dot(texture(uDye, uv + vec2(0, uTx.y)), vec4(1));
  vec3 n = normalize(vec3((l - r) * 3.0, (b - t) * 3.0, 1.0));
  float diff = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  float body = 1.0 - exp(-dens * 1.3);
  float shade = mix(1.0, 0.8 + 0.42 * diff, smoothstep(0.04, 0.5, body) * (1.0 - smoothstep(0.8, 1.0, body)));
  vec3 col;
  if (uMode < 0.5) {
    col = uPaper * exp(-a) * shade;
    col = mix(col, uInk, max(smoothstep(0.8, 1.0, 1.0 - exp(-D.r * 1.35)) * 0.6, flood));
  } else {
    vec3 lit = 1.0 - exp(-a);
    col = uPaper * exp(-dens * 0.6) + lit * (0.55 + 0.7 * diff);
    col = mix(col, uInk, flood);
  }
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  col *= mix(1.0, 1.0 - uVignette, smoothstep(0.35, 1.25, length(q)));
  col += (hash(vUv * uRes + fract(uTime * 17.0) * 311.0) - 0.5) * uGrain;
  o = vec4(col, 1.0);
}`;

/** absorbance for a pigment that looks like `rgb` at full strength on white */
const absorb = (c, k = 1) => c.map((v) => -Math.log(Math.max(0.03, v)) * k);
/** scattering colours for milky pigment in dark water (mode 1) */
export const SCATTER = {
  ink: [0.95, 0.93, 0.88],
  cinnabar: [1.1, 0.26, 0.16],
  azurite: [0.25, 0.5, 1.0],
  malachite: [0.26, 0.85, 0.6],
  gold: [1.1, 0.8, 0.35],
};
export const PIGMENTS = {
  ink: [1.25, 1.3, 1.42],
  cinnabar: absorb([0.74, 0.2, 0.15], 0.9),
  azurite: absorb([0.16, 0.36, 0.66], 0.9),
  malachite: absorb([0.2, 0.55, 0.42], 0.9),
  gold: absorb([0.86, 0.66, 0.26], 0.8),
};

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export class InkWater {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o
   */
  constructor(canvas, { host = canvas, dye = 720, sim = 200, vorticity = 22, buoyancy = 70, noise = 9, dyeDiss = 0.12, velDiss = 0.35, paper = '#efebe3', ink = '#0d0f12', pigments = ['ink', 'cinnabar', 'azurite', 'malachite'], mode = 0, stir = true, maxDpr = 1.75 } = {}) {
    this.g = new GL(canvas);
    if (!this.g.float) throw new Error('float targets unavailable');
    this.canvas = canvas;
    this.host = host;
    this.cfg = { dye, sim, maxDpr };
    // animatable: GSAP tweens these
    this.u = { vorticity, buoyancy, noise, dyeDiss, velDiss, attract: 0, source: 0, flood: 0, zoom: 1, timeScale: 1, grain: 0.035, vignette: 0.16 };
    this.colors = { paper: hex(paper), ink: hex(ink) };
    this.mode = mode;
    this.setPigments(pigments);
    const g = this.g;
    this.p = {
      curl: g.program(CURL), forces: g.program(FORCES), splat: g.program(SPLAT), div: g.program(DIV), scale: g.program(SCALE),
      pressure: g.program(PRESSURE), grad: g.program(GRAD), advVel: g.program(ADVECT_VEL), advDye: g.program(ADVECT_DYE), render: g.program(RENDER),
    };
    this.time = 0;
    this.brush = 0; // dye channel the pointer paints with
    this.trail = 1; // how much pigment the pointer sheds
    this.glyph = null;
    this.queue = [];
    this.resize(true);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    if (stir) this.#bindPointer();
  }

  resize(force = false) {
    const g = this.g, gl = g.gl;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (!force && this.cssW === r.width && Math.abs(this.cssH - r.height) / this.cssH < 0.2) return;
    this.cssW = r.width; this.cssH = r.height;
    g.fit(this.cfg.maxDpr);
    this.aspect = r.width / r.height;
    const res = (n) => (this.aspect >= 1 ? [Math.round(n * this.aspect), n] : [n, Math.round(n / this.aspect)]);
    const [dw, dh] = res(Math.min(this.cfg.dye, Math.round(Math.min(r.width, r.height) * Math.min(devicePixelRatio || 1, 1.5))));
    const [sw, sh] = res(this.cfg.sim);
    [this.vel, this.dye, this.pres, this.curl, this.divT].forEach((t) => g.free(t));
    this.vel = g.pair(sw, sh, { internal: gl.RG16F, format: gl.RG });
    this.pres = g.pair(sw, sh, { internal: gl.R16F, format: gl.RED });
    this.curl = g.target(sw, sh, { internal: gl.R16F, format: gl.RED });
    this.divT = g.target(sw, sh, { internal: gl.R16F, format: gl.RED });
    this.dye = g.pair(dw, dh);
    if (this.glyph) this.setGlyph(this.glyph.text, this.glyph.opts);
  }

  /* ---------------- input ---------------- */
  #bindPointer() {
    let last = null;
    this.onMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) { last = null; return; }
      if (last) {
        const dx = x - last.x, dy = y - last.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.0005) this.queue.push({ x, y, dx, dy });
      }
      last = { x, y };
    };
    this.onLeave = () => (last = null);
    this.onClick = (e) => {
      const r = this.canvas.getBoundingClientRect();
      if (e.target.closest('a, button')) return;
      this.drop((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, { size: 0.7, channel: this.clickChannel?.() ?? (Math.random() < 0.18 ? 1 : 0) });
    };
    this.host.addEventListener('pointermove', this.onMove, { passive: true });
    this.host.addEventListener('pointerleave', this.onLeave);
    this.host.addEventListener('click', this.onClick);
  }

  splat(x, y, dx, dy, { ink = 0, dye = null, radius = 0.0025 } = {}) {
    const g = this.g;
    if (dx || dy) {
      g.run(this.p.splat, this.vel.write, { uTarget: this.vel.read, uPoint: [x, y], uValue: [dx, dy, 0, 0], uRadius: radius, uAspect: this.aspect });
      this.vel.swap();
    }
    if (ink && !dye) { dye = [0, 0, 0, 0]; dye[this.brush] = ink; }
    if (dye) {
      g.run(this.p.splat, this.dye.write, { uTarget: this.dye.read, uPoint: [x, y], uValue: dye, uRadius: radius * 0.6, uAspect: this.aspect });
      this.dye.swap();
    }
  }

  /** a drop of ink hits the water: a dense core and a downward punch that mushrooms */
  drop(x, y, { size = 1, red = false, channel = red ? 1 : 0, amount = 4.5, force = 1, dir = -1 } = {}) {
    const r = 0.0009 * size * size;
    const v = (k) => { const a = [0, 0, 0, 0]; a[channel] = k; return a; };
    this.splat(x, y, 0, 900 * dir * force * size, { radius: r * 2.2 });
    this.splat(x, y, 0, 0, { dye: v(amount), radius: r });
    // a few satellite droplets break off
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, d = 0.012 * size + Math.random() * 0.02 * size;
      this.splat(x + (Math.cos(a) * d) / this.aspect, y + Math.sin(a) * d, Math.cos(a) * 120, Math.sin(a) * 120 + 250 * dir, { dye: v(amount * 0.35), radius: r * 0.25 });
    }
  }

  /**
   * Text the ink condenses into. `rect` (px, relative to the canvas) places it exactly over a DOM element.
   */
  setGlyph(text, opts = {}) {
    const g = this.g, gl = g.gl;
    this.glyph = { text, opts };
    const W = Math.round(this.dye.w), H = Math.round(this.dye.h);
    const cr = this.canvas.getBoundingClientRect();
    let x = 0.5, y = 0.5, size = opts.size ?? 0.5;
    let px = null;
    if (opts.el) {
      const er = opts.el.getBoundingClientRect();
      x = (er.left + er.width / 2 - cr.left) / cr.width;
      y = (er.top + er.height / 2 - cr.top) / cr.height;
      px = (parseFloat(getComputedStyle(opts.el).fontSize) / cr.height) * H;
    }
    const draw = (blur) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x2 = c.getContext('2d');
      const fs = px ?? Math.min(W / [...text].length, H) * size;
      x2.font = `${fs}px ${opts.font ?? '"KingHwa_OldSong", "Noto Serif SC Variable", serif'}`;
      if (opts.spacing) x2.letterSpacing = `${fs * opts.spacing}px`;
      x2.textAlign = 'center';
      x2.textBaseline = 'middle';
      x2.fillStyle = '#fff';
      if (blur) x2.filter = `blur(${blur}px)`;
      if (opts.parts) {
        // a composed lockup: each character is placed, sized and turned exactly like its DOM span
        for (const el of opts.parts) {
          const er = el.getBoundingClientRect(), cs = getComputedStyle(el);
          const f = (parseFloat(cs.fontSize) / cr.height) * H;
          const rot = parseFloat(cs.rotate) || 0;
          x2.save();
          x2.font = `${f}px ${opts.font}`;
          x2.translate(((er.left + er.width / 2 - cr.left) / cr.width) * W, ((er.top + er.height / 2 - cr.top) / cr.height) * H);
          x2.rotate((rot * Math.PI) / 180);
          // CSS centres the font's content area in the line box: match that rather than the em middle
          x2.textBaseline = 'alphabetic';
          const mt = x2.measureText(el.textContent);
          x2.fillText(el.textContent, 0, ((mt.fontBoundingBoxAscent ?? f * 0.88) - (mt.fontBoundingBoxDescent ?? f * 0.12)) / 2);
          x2.restore();
        }
        return c;
      }
      x2.fillText(text, W * x, H * (y + (opts.dy ?? (opts.el ? 0 : 0.04))));
      return c;
    };
    if (this.mask) { gl.deleteTexture(this.mask); gl.deleteTexture(this.field); }
    const mc = draw(0);
    if (import.meta.env?.DEV) this._maskCanvas = mc;
    this.mask = g.texture(mc);
    // a tight field keeps thin, fast brush strokes from collapsing into their centre of mass
    this.field = g.texture(draw(Math.max(4, H * (opts.fieldBlur ?? 0.05))));
    this.fieldTx = [2 / W, 2 / H];
  }
  clearGlyph() { this.glyph = null; }

  /* ---------------- step ---------------- */
  step(dt) {
    const g = this.g, p = this.p, u = this.u;
    dt *= u.timeScale;
    this.time += dt;
    const tx = this.vel.texel;
    for (const s of this.queue.splice(0)) {
      const sp = Math.hypot(s.dx * this.aspect, s.dy);
      this.splat(s.x, s.y, s.dx * 5200, s.dy * 5200, { radius: 0.0016 + sp * 0.02, ink: Math.min(0.35, sp * 6) * this.trail });
    }
    g.run(p.curl, this.curl, { uVel: this.vel, uTx: tx });
    g.run(p.forces, this.vel.write, { uVel: this.vel, uCurl: this.curl, uDye: this.dye, uTx: tx, uDt: dt, uVort: u.vorticity, uTime: this.time, uNoise: u.noise, uBuoy: u.buoyancy, uAspect: this.aspect });
    this.vel.swap();
    g.run(p.div, this.divT, { uVel: this.vel, uTx: tx });
    g.run(p.scale, this.pres.write, { uTex: this.pres, uK: 0.8 });
    this.pres.swap();
    for (let i = 0; i < 20; i++) {
      g.run(p.pressure, this.pres.write, { uP: this.pres, uDiv: this.divT, uTx: tx });
      this.pres.swap();
    }
    g.run(p.grad, this.vel.write, { uP: this.pres, uVel: this.vel, uTx: tx });
    this.vel.swap();
    g.run(p.advVel, this.vel.write, { uVel: this.vel, uTx: tx, uDt: dt, uDiss: u.velDiss });
    this.vel.swap();
    const glyph = !!(this.glyph && this.mask);
    g.run(p.advDye, this.dye.write, {
      uVel: this.vel, uDye: this.dye, uMask: glyph ? this.mask : this.dye.read.tex, uField: glyph ? this.field : this.dye.read.tex,
      uTx: tx, uFTx: this.fieldTx || [0, 0], uDt: dt, uDiss: u.dyeDiss, uAttract: u.attract, uSource: u.source, uTime: this.time, uGlyph: glyph ? 1 : 0, uEdge: this.glyph?.opts.edge ?? 0.8, uHalo: this.glyph?.opts.halo ?? 0.5,
    });
    this.dye.swap();
  }

  /** four dye channels → four pigments (names from PIGMENTS, or raw absorbance/scatter triples) */
  setPigments(list) {
    this.K = list.map((p) => (typeof p === 'string' ? (this.mode ? SCATTER[p] : PIGMENTS[p]) : p));
  }

  render() {
    const c = this.colors, u = this.u, K = this.K;
    this.g.run(this.p.render, null, {
      uDye: this.dye, uTx: this.dye.texel, uRes: [this.canvas.width, this.canvas.height], uTime: this.time, uFlood: u.flood, uZoom: u.zoom,
      uGrain: u.grain, uAspect: this.aspect, uVignette: u.vignette, uMode: this.mode, uPaper: c.paper, uInk: c.ink, uK0: K[0], uK1: K[1], uK2: K[2], uK3: K[3],
    });
  }

  frame(dt) {
    this.step(dt);
    this.render();
  }

  destroy() {
    this.ro?.disconnect();
    this.host.removeEventListener('pointermove', this.onMove);
    this.host.removeEventListener('pointerleave', this.onLeave);
    this.host.removeEventListener('click', this.onClick);
    this.g.lose();
  }
}

export { textMask };
