import { cjkCSS } from '../fonts.js';
import { getGL, makeProgram, makeTexture, updateTexture, bind, fit, NOISE } from './gl.js';
import { reduced } from '../env.js';

/**
 * InkGlyph: brush calligraphy rendered as ink on paper.
 *
 * A calligraphy font gives the silhouette; the shader gives it the qualities of real ink:
 *  - ragged, fibrous edges (the paper's fibres catching the ink)
 *  - ink pooling darker at the stroke rims, lighter in the wet centre
 *  - 飞白 dry-brush streaks where the brush runs out
 *  - 洇 a faint grey bleed that spreads into the paper after the stroke lands
 *  - writing: strokes grow from their spine outwards, in reading order
 *    (top→bottom, right→left for vertical text; top-left→bottom-right otherwise)
 *
 * Three rasterisations of the same text drive it: sharp, slightly blurred (stroke spine)
 * and very blurred (bleed). Blur comes from downscaling, which works in every browser.
 */
const FRAG = /* glsl */ `
${NOISE}
uniform sampler2D uSharp, uMid, uWide;
uniform vec2 uRes;
uniform float uP, uSeed, uDry, uVertical, uBleed, uFs;
uniform vec3 uInk;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  // texture space is measured in glyph sizes, so a 60 px glyph and a 600 px glyph get the same brush
  vec2 st = uv * uRes / uFs;

  float n1 = fbm(st * 5.0 + uSeed);
  float n2 = fbm3(st * 24.0 - uSeed * 1.7);

  // fibrous edge: nudge the lookup with fine noise
  vec2 d = (vec2(fbm3(st * 46.0 + 3.1), fbm3(st * 46.0 + 7.7)) - 0.5) * (uFs * 0.011) / uRes;
  float sharp = texture2D(uSharp, uv + d).a;
  float mid = texture2D(uMid, uv).a;
  float wide = texture2D(uWide, uv).a;

  // reading order, 0 → 1
  vec2 top = vec2(uv.x, 1.0 - uv.y);
  float order = mix(top.y * 0.7 + top.x * 0.3, (1.0 - top.x) * 0.62 + top.y * 0.38, uVertical);
  float r = clamp((uP * 1.6 - order * 0.6 - (n1 - 0.5) * 0.25) / 0.55, 0.0, 1.0);

  // strokes grow from the spine (high blurred value) out to the edge
  float T = mix(1.02, 0.18, r);
  float grow = smoothstep(T - 0.06, T + 0.03, mid + (n2 - 0.5) * 0.08);
  float a = sharp * grow;

  // ink density: darker rims, a little lighter in the wet core, mottled
  float core = smoothstep(0.62, 0.98, mid);
  float density = mix(1.0, 0.86, core) * (0.9 + 0.2 * n1);

  // 飞白: streaks along a slightly tilted brush direction, in dry patches
  float ang = -0.32 + (n1 - 0.5) * 0.6;
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 bs = R * st;
  float streak = fbm3(vec2(bs.x * 3.0, bs.y * 80.0) + uSeed);
  float dry = smoothstep(0.5, 0.74, fbm(st * 1.8 + uSeed * 3.3)) * uDry * (1.0 - core * 0.55);
  a *= mix(1.0, smoothstep(0.36, 0.52, streak), dry);

  // 洇: grey bleed into the paper, arriving just after the stroke
  float halo = smoothstep(0.04, 0.5, wide + (n2 - 0.5) * 0.12) * (1.0 - sharp);
  halo *= 0.13 * uBleed * smoothstep(0.35, 1.0, r) * (0.55 + 0.9 * n1);

  float alpha = clamp(a * density + halo, 0.0, 1.0);
  gl_FragColor = vec4(uInk * alpha, alpha);
}`;

const fontsReady = new Map();
function loadFont(font, text) {
  const key = font + text;
  // the brush face lives in the async CJK stylesheet: wait for its @font-face rules first
  if (!fontsReady.has(key)) fontsReady.set(key, cjkCSS.then(() => (document.fonts ? document.fonts.load(`100px "${font}"`, text) : null)).catch(() => {}));
  return fontsReady.get(key);
}

export class InkGlyph {
  /**
   * @param {HTMLElement} el container (sized by CSS)
   * @param {object} o
   */
  constructor(el, o = {}) {
    this.el = el;
    this.o = {
      text: el.dataset.ink || '品',
      vertical: el.dataset.inkVertical !== undefined,
      font: el.dataset.inkFont || 'Zhi Mang Xing',
      fill: parseFloat(el.dataset.inkFill || '0.86'),
      duration: parseFloat(el.dataset.inkDuration || '2.6'),
      dry: parseFloat(el.dataset.inkDry || '0.9'),
      bleed: parseFloat(el.dataset.inkBleed || '1'),
      ink: [0.075, 0.07, 0.06],
      auto: el.dataset.inkManual === undefined,
      ...o,
    };
    this.p = 0;
    el._ink = this;
    this.seed = Math.random() * 50;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ink-glyph__gl';
    this.canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(this.canvas);
    const gl = (this.gl = getGL(this.canvas));
    if (!gl) return this.fallback();
    try {
      this.prog = makeProgram(gl, FRAG);
    } catch (e) {
      console.warn('[ink]', e);
      return this.fallback();
    }
    this.tex = [makeTexture(gl), makeTexture(gl), makeTexture(gl)];
    this.ready = loadFont(this.o.font, this.o.text).then(() => this.raster());
    new ResizeObserver(() => this.ready.then(() => this.raster())).observe(el);
    if (this.o.auto) {
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          this.ready.then(() => this.write());
        }
      }, { threshold: 0.35 });
      io.observe(el);
    }
  }

  fallback() {
    this.canvas.remove();
    const s = document.createElement('span');
    s.className = 'ink-glyph__text';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = this.o.text;
    this.el.appendChild(s);
    this.dead = true;
  }

  /** rasterise the text into sharp / spine / bleed layers */
  raster() {
    if (this.dead) return;
    fit(this.canvas, 2, 2000);
    const W = this.canvas.width, H = this.canvas.height;
    if (W < 4 || H < 4) return;
    const { text, vertical, font, fill } = this.o;
    const chars = [...text];
    const c = this.sharpCanvas || (this.sharpCanvas = document.createElement('canvas'));
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#000';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const n = chars.length;
    const fs = vertical ? Math.min(W * fill, (H * fill) / (n * 0.98)) : Math.min(H * fill, (W * fill) / (n * 0.98));
    x.font = `${fs}px "${font}"`;
    this.fs = fs;
    chars.forEach((ch, i) => {
      const k = (i + 0.5) / n - 0.5;
      const cx = vertical ? W / 2 : W / 2 + k * fs * 0.98 * n;
      const cy = vertical ? H / 2 + k * fs * 0.98 * n : H / 2;
      x.fillText(ch, cx, cy + fs * 0.03);
    });
    const blur = (src, f) => {
      // two-step downscale for a smoother blur
      const a = document.createElement('canvas');
      a.width = Math.max(2, Math.round(W / Math.sqrt(f)));
      a.height = Math.max(2, Math.round(H / Math.sqrt(f)));
      const ax = a.getContext('2d');
      ax.imageSmoothingQuality = 'high';
      ax.drawImage(src, 0, 0, a.width, a.height);
      const b = document.createElement('canvas');
      b.width = Math.max(2, Math.round(W / f));
      b.height = Math.max(2, Math.round(H / f));
      const bx = b.getContext('2d');
      bx.imageSmoothingQuality = 'high';
      bx.drawImage(a, 0, 0, b.width, b.height);
      return b;
    };
    const unit = fs / 100; // blur scales with the glyph, not the canvas
    const gl = this.gl;
    updateTexture(gl, this.tex[0], c);
    updateTexture(gl, this.tex[1], blur(c, Math.max(2, unit * 5)));
    updateTexture(gl, this.tex[2], blur(c, Math.max(4, unit * 18)));
    if (reduced && this.o.auto) this.p = 1;
    this.render();
  }

  render() {
    if (this.dead) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.tex.forEach((t, i) => bind(gl, i, t));
    this.prog.use()
      .i('uSharp', 0).i('uMid', 1).i('uWide', 2)
      .f('uRes', this.canvas.width, this.canvas.height)
      .f('uP', this.p)
      .f('uSeed', this.seed)
      .f('uDry', this.o.dry)
      .f('uBleed', this.o.bleed)
      .f('uVertical', this.o.vertical ? 1 : 0)
      .f('uFs', this.fs || Math.min(this.canvas.width, this.canvas.height))
      .f('uInk', ...this.o.ink)
      .draw();
  }

  /** animate the writing; resolves when the ink has settled */
  write(duration = this.o.duration) {
    if (this.dead) return Promise.resolve();
    if (reduced) {
      this.p = 1;
      this.render();
      return Promise.resolve();
    }
    cancelAnimationFrame(this.raf);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / (duration * 1000));
        this.p = 1 - Math.pow(1 - t, 2.2);
        this.render();
        if (t < 1) this.raf = requestAnimationFrame(step);
        else resolve();
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  /** swap the text (Labs), then write it */
  async setText(text) {
    this.o.text = text;
    this.seed = Math.random() * 50;
    await loadFont(this.o.font, text);
    this.p = 0;
    this.raster();
    return this.write();
  }
}

export function initInkGlyphs(root = document) {
  return [...root.querySelectorAll('[data-ink]')].map((el) => new InkGlyph(el));
}
