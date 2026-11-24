import { GL, HEAD, visibleLoop } from '../gl/gl2.js';
import { t } from '../i18n.js';

/**
 * Case 01 · 口袋瓜拼豆 — the pattern engine, live.
 *
 * One fragment shader runs the product's core pipeline on the GPU, per pixel:
 *   photo  →  cell average (mip box filter)  →  nearest bead colour in OKLab  →  a lit plastic bead.
 * `stage` (scrubbed by scroll) walks the pipeline: 0 photo · 1 flat pattern · 2 fused beads.
 * The cursor is a square inspection lens (the studio's 口 frame) that shows the next stage early,
 * and it is also the light: bead highlights turn to face it. Click to change the board density.
 */
// a 48-colour fuse-bead palette (approximate retail colours, sRGB)
const PALETTE = [
  '#f7f5ef', '#e9e4d6', '#c9c4b8', '#9c978d', '#6b6862', '#3d3c3a', '#1c1c1e', '#0b0b0d',
  '#f6d7c1', '#e9b28f', '#c98a62', '#9b5e3c', '#6e3d26', '#4a2618', '#7d4a32', '#2e1b13',
  '#fff07a', '#ffd23f', '#f7a823', '#f07f1f', '#e8541c', '#d93a1b', '#b82a1e', '#8c1f1c',
  '#ff9ab2', '#f0658b', '#d43d6e', '#9e2c5e', '#c79be0', '#8f5cc2', '#5c3a9e', '#2f2a6e',
  '#a8d8f5', '#5fb3ec', '#2d7fd8', '#1f57c3', '#1a3c96', '#142a66', '#7fe0d6', '#2fb7a8',
  '#c7ec7a', '#8fd14f', '#4caf50', '#2e7d4f', '#1f5a3b', '#d4b483', '#b38b55', '#5c3524',
];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function oklab([r, g, b]) {
  [r, g, b] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const PAL_RGB = PALETTE.map(hex);
const PAL_LAB = PAL_RGB.map(oklab);

const FS = HEAD + `
uniform sampler2D uImg;
uniform vec2 uRes, uImg2, uMouse;
uniform float uTime, uStage, uGrid, uLens, uLensSize, uPx;
uniform vec3 uPal[48], uLab[48];

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 oklab(vec3 c) {
  c = toLin(c);
  vec3 lms = vec3(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)), dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)), dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return vec3(dot(lms, vec3(0.2104542553, 0.793617785, -0.0040720468)), dot(lms, vec3(1.9779984951, -2.428592205, 0.4505937099)), dot(lms, vec3(0.0259040371, 0.7827717662, -0.808675766)));
}
// cover-fit: screen px -> image uv
vec2 cover(vec2 px) {
  vec2 s = uRes / uImg2; float k = max(s.x, s.y);
  vec2 uv = (px - 0.5 * uRes) / (uImg2 * k) + 0.5;
  // bias the crop towards the subject's eyes (upper third) when the frame is wider than the photo
  float spare = 1.0 - uRes.y / (uImg2.y * k);
  return vec2(uv.x, 1.0 - uv.y + 0.14 * spare);
}
vec3 nearest(vec3 c, out int idx) {
  vec3 L = oklab(c); float best = 1e9; idx = 0;
  for (int i = 0; i < 48; i++) { vec3 d = L - uLab[i]; d.x *= 1.15; float e = dot(d, d); if (e < best) { best = e; idx = i; } }
  return uPal[idx];
}

void main() {
  vec2 frag = vUv * uRes;
  vec2 fragDown = vec2(frag.x, uRes.y - frag.y);
  float cs = uRes.x / uGrid;
  vec2 cell = floor(fragDown / cs);
  vec2 p = fract(fragDown / cs) - 0.5;
  vec2 cuv = cover((cell + 0.5) * cs);
  // box-filter the cell through the mip chain
  float k = max(uRes.x / uImg2.x, uRes.y / uImg2.y);
  float lod = log2(max(1.0, cs / k));
  vec3 avg = textureLod(uImg, cuv, lod).rgb;
  int idx; vec3 bead = nearest(avg, idx);

  // the inspection lens: a square window, the studio's frame, carried by the cursor
  vec2 dm = abs(fragDown - uMouse) - uLensSize * 0.5;
  float inLens = (1.0 - smoothstep(-1.0, 1.0, max(dm.x, dm.y))) * uLens;
  float s = clamp(uStage + inLens * 1.4, 0.0, 2.0);

  // stage 0: the photograph (a hint of the grid already shows through)
  vec3 photo = texture(uImg, cover(fragDown)).rgb;

  // stage 1: flat pattern — square cells with a hairline gutter
  float gut = smoothstep(0.5, 0.5 - 1.2 / cs, max(abs(p.x), abs(p.y)));
  vec3 flat_ = mix(vec3(0.05), bead, gut);

  // stage 2: fused beads — a torus seen from above, lit by the cursor
  float r = length(p);
  float rc = 0.28, w = 0.2;
  float q = clamp((r - rc) / w, -1.0, 1.0);
  float hgt = sqrt(1.0 - q * q);
  float mask = smoothstep(rc + w + 0.02, rc + w - 0.01, r) * smoothstep(rc - w - 0.02, rc - w + 0.01, r);
  vec2 dir = r > 1e-4 ? p / r : vec2(0.0);
  float slope = -q / max(hgt, 0.08);
  vec3 n = normalize(vec3(dir * slope * 0.9, 1.0));
  // n, L and p all live in the same y-down screen space
  vec3 lp = vec3((uMouse - fragDown) / uRes.y, 0.55);
  vec3 L = normalize(lp);
  vec3 V = vec3(0, 0, 1);
  vec3 H = normalize(L + V);
  vec3 base = toLin(bead);
  float diff = max(dot(n, L), 0.0);
  float spec = (pow(max(dot(n, H), 0.0), 36.0) * 0.5 + pow(max(dot(n, H), 0.0), 6.0) * 0.06) * smoothstep(0.25, 0.75, hgt);
  float fres = pow(1.0 - max(n.z, 0.0), 3.0);
  float ao = mix(0.7, 1.0, smoothstep(0.0, 0.9, hgt));
  vec3 lit = base * (0.62 + 0.75 * diff) * ao + vec3(spec) * mix(0.6, 1.0, diff) + fres * 0.18 * base;
  // pegboard between beads: dark plastic with a peg in every hole
  vec3 board = vec3(0.028, 0.03, 0.036) * (1.0 - 0.4 * smoothstep(0.0, 0.5, r));
  board += vec3(0.05) * smoothstep(0.09, 0.05, r);
  vec3 beads = mix(board, toSrgb(lit * 1.3), mask);

  vec3 col = s < 1.0 ? mix(photo, flat_, smoothstep(0.0, 1.0, s)) : mix(flat_, beads, smoothstep(1.0, 2.0, s));

  // lens edge: a hairline frame so the window reads even without the cursor
  float edge = (1.0 - smoothstep(0.0, 1.2 * uPx, abs(max(dm.x, dm.y)))) * uLens;
  col = mix(col, vec3(1.0), edge * 0.5);

  // grade: lift blacks slightly, vignette, grain
  vec2 c = vUv - 0.5;
  col *= 1.0 - 0.35 * dot(c, c);
  col += (hash(frag + fract(uTime) * 91.0) - 0.5) * 0.025;
  o = vec4(col, 1.0);
}`;

export function initBeadStage(host, { onStats } = {}) {
  const canvas = host.querySelector('canvas');
  let g;
  try {
    g = new GL(canvas, { antialias: false });
  } catch (e) {
    host.classList.add('no-gl');
    return null;
  }
  const gl = g.gl;
  const prog = g.program(FS);
  const GRIDS = innerWidth < 700 ? [36, 52, 76] : [52, 76, 112];
  const state = { stage: 0, grid: GRIDS[1], lens: 0, lensTarget: 0, mouse: null, auto: true, t: 0, ready: false };
  const live = host.querySelector('[data-live]');
  let announce = false;
  const pal = new Float32Array(PAL_RGB.flat());
  const lab = new Float32Array(PAL_LAB.flat());
  // uniform arrays aren't handled by GL.run; they live on the program, so set them once
  gl.useProgram(prog.p);
  gl.uniform3fv(prog.u.uPal.loc, pal);
  gl.uniform3fv(prog.u.uLab.loc, lab);

  let tex = null, img2 = [1, 1];
  const img = new Image();
  img.decoding = 'async';
  img.src = host.dataset.src;
  img.onload = () => {
    tex = g.texture(img);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    img2 = [img.naturalWidth, img.naturalHeight];
    state.ready = true;
    stats();
  };

  /** honest numbers for the HUD: quantize the board on the CPU once per density */
  function stats() {
    if (!state.ready) { announce = false; return; }
    const r = canvas.getBoundingClientRect();
    const cols = state.grid, rows = Math.max(1, Math.round((cols * r.height) / Math.max(1, r.width)));
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const x = c.getContext('2d', { willReadFrequently: true });
    const k = Math.max(cols / img2[0], rows / img2[1]);
    const w = img2[0] * k, h = img2[1] * k;
    x.drawImage(img, (cols - w) / 2, (rows - h) / 2, w, h);
    const d = x.getImageData(0, 0, cols, rows).data;
    const used = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const L = oklab([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
      let best = 1e9, bi = 0;
      for (let j = 0; j < PAL_LAB.length; j++) {
        const a = L[0] - PAL_LAB[j][0], b = L[1] - PAL_LAB[j][1], cc = L[2] - PAL_LAB[j][2];
        const e = a * a * 1.3225 + b * b + cc * cc;
        if (e < best) { best = e; bi = j; }
      }
      used.add(bi);
    }
    onStats?.({ cols, rows, beads: cols * rows, colors: used.size, palette: PALETTE.length });
    if (announce && live) {
      live.textContent = t(`豆板密度：${cols} 列 × ${rows} 行，共 ${cols * rows} 颗`, `Board density: ${cols} × ${rows}, ${cols * rows} beads`);
      announce = false;
    }
  }

  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  };
  host.addEventListener('pointermove', (e) => { state.mouse = toLocal(e); state.auto = false; state.lensTarget = 1; }, { passive: true });
  host.addEventListener('pointerleave', () => { state.auto = true; });

  const cycle = (dir = 1) => {
    state.grid = GRIDS[(GRIDS.indexOf(state.grid) + dir + GRIDS.length) % GRIDS.length];
    announce = true;
    stats();
  };
  host.addEventListener('click', () => cycle(1));
  // keyboard door: the stage-key button (and ← →) do what a click does
  host.querySelector('[data-key="density"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.lensTarget = 1;
    cycle(1);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      state.lensTarget = 1;
      cycle(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  const cur = [0, 0];
  let resized = true;
  new ResizeObserver(() => (resized = true)).observe(canvas);

  const api = {
    set stage(v) { state.stage = v; },
    get stage() { return state.stage; },
    set lens(v) { state.lensTarget = v; },
    grids: GRIDS,
    get grid() { return state.grid; },
  };

  visibleLoop(host, (dt) => {
    if (resized) { g.fit(1.5); resized = false; stats(); }
    if (!tex) return;
    state.t += dt;
    const W = canvas.width, H = canvas.height;
    let target;
    if (state.auto || !state.mouse) {
      // drift the lens on a slow Lissajous when nobody is steering
      target = [W * (0.5 + 0.28 * Math.sin(state.t * 0.37)), H * (0.48 + 0.22 * Math.sin(state.t * 0.53 + 1.3))];
    } else target = state.mouse;
    if (!cur.seeded) { cur[0] = target[0]; cur[1] = target[1]; cur.seeded = true; }
    const k = 1 - Math.exp(-dt * (state.auto ? 3 : 14));
    cur[0] += (target[0] - cur[0]) * k;
    cur[1] += (target[1] - cur[1]) * k;
    state.lens += (state.lensTarget - state.lens) * (1 - Math.exp(-dt * 5));
    const px = W / canvas.getBoundingClientRect().width;
    g.run(prog, null, {
      uImg: tex, uRes: [W, H], uImg2: img2, uMouse: cur, uTime: state.t,
      uStage: state.stage, uGrid: state.grid, uLens: state.lens, uLensSize: Math.min(W, H) * 0.34, uPx: px,
    });
  });
  return api;
}
