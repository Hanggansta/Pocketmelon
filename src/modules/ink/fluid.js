/**
 * InkPaper: a GPU ink-on-rice-paper medium (WebGL2, no three.js).
 *
 * Three coupled layers, loosely after MoXi (Chu & Tai, SIGGRAPH 2005):
 *   1. a stable-fluids velocity field: the brush drags water, a drop pushes it outward
 *   2. an ink field per texel: r = wet pigment, g = water, b = fixed pigment, a = dried water mark
 *      water percolates through a disordered paper (fibre-driven permeability) and pigment follows it;
 *      pigment fixes into the paper as water evaporates, faster at the drying front (edge darkening)
 *   3. a procedural xuan paper: cloudy pulp, long fibres, grain. It drives permeability (nijimi
 *      feathering along fibres), dry-brush skips (飞白) and granulation, and is lit as a surface
 *
 * The brush is a bristle model: streaks across the tip, ink load that runs out along a stroke,
 * thinner and drier when fast, and refills when the brush rests (蘸墨).
 */

const VS = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p; a *= 0.5; }
  return v;
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * h);
}
`;

/* --- paper: r height, g permeability, b grain, a mask (1 = absorbent, 0 = alum-sized) --- */
const PAPER = HEAD + /* glsl */ `
uniform vec2 uRes;
uniform float uScale;
uniform float uSeed;
uniform sampler2D uMask;
uniform float uHasMask;
float strands(vec2 p, float k) {
  float a = k * 2.39996 + uSeed + (hash(vec2(k * 7.1, uSeed + 3.3)) - 0.5) * 0.9;
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 q = R * p + k * 37.0;
  // curl the strands: real kozo/sandalwood fibres wander
  q += 26.0 * vec2(fbm(p * 0.006 + k), fbm(p * 0.006 - k + 3.1)) - 13.0;
  float n = noise(q * vec2(0.022, 0.42));
  float s = pow(1.0 - abs(n * 2.0 - 1.0), 26.0);
  float gate = smoothstep(0.6, 0.92, noise(q * vec2(0.006, 0.03) + 9.0));
  return s * gate;
}
void main() {
  vec2 p = gl_FragCoord.xy / uScale + uSeed * 113.0;
  float cloud = fbm(p * 0.0045);
  float pulp = fbm(p * 0.028);
  float fib = 0.0;
  for (int k = 0; k < 7; k++) fib += strands(p, float(k)) * (0.55 + 0.45 * hash(vec2(float(k), 9.0)));
  fib = clamp(fib, 0.0, 1.0);
  float grain = noise(p * 0.7) * 0.6 + noise(p * 1.9) * 0.4;
  float height = 0.40 * cloud + 0.22 * pulp + 0.32 * fib + 0.06 * grain;
  float perm = clamp(0.25 + 0.55 * pulp + 0.75 * fib + 0.15 * (cloud - 0.5), 0.05, 1.0);
  float mask = 1.0;
  if (uHasMask > 0.5) mask = texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).a;
  o = vec4(height, perm, grain, mask);
}`;

/* --- fluid --- */
const VSPLAT = HEAD + /* glsl */ `
uniform sampler2D uVel;
uniform vec2 uA, uB, uForce;
uniform float uR, uAspect, uRadial;
void main() {
  vec2 v = texture(uVel, vUv).xy;
  vec2 p = vUv * vec2(uAspect, 1.0);
  float d = sdSeg(p, uA, uB);
  float g = exp(-d * d / (uR * uR));
  vec2 out_ = uForce;
  if (uRadial != 0.0) out_ = normalize(p - uA + 1e-6) * uRadial * smoothstep(0.0, uR, d);
  out_.x /= uAspect;
  o = vec4(v + out_ * g, 0.0, 1.0);
}`;
const ADVECT = HEAD + /* glsl */ `
uniform sampler2D uVel, uSrc;
uniform float uDt, uDiss;
void main() {
  vec2 v = texture(uVel, vUv).xy;
  o = uDiss * texture(uSrc, vUv - v * uDt);
}`;
const DIV = HEAD + /* glsl */ `
uniform sampler2D uVel;
uniform vec2 uTx;
void main() {
  float l = texture(uVel, vUv - vec2(uTx.x, 0)).x, r = texture(uVel, vUv + vec2(uTx.x, 0)).x;
  float b = texture(uVel, vUv - vec2(0, uTx.y)).y, t = texture(uVel, vUv + vec2(0, uTx.y)).y;
  o = vec4(0.5 * (r - l + t - b), 0, 0, 1);
}`;
const PRESSURE = HEAD + /* glsl */ `
uniform sampler2D uP, uDiv;
uniform vec2 uTx;
void main() {
  float l = texture(uP, vUv - vec2(uTx.x, 0)).x, r = texture(uP, vUv + vec2(uTx.x, 0)).x;
  float b = texture(uP, vUv - vec2(0, uTx.y)).x, t = texture(uP, vUv + vec2(0, uTx.y)).x;
  o = vec4((l + r + b + t - texture(uDiv, vUv).x) * 0.25, 0, 0, 1);
}`;
const GRAD = HEAD + /* glsl */ `
uniform sampler2D uP, uVel;
uniform vec2 uTx;
void main() {
  float l = texture(uP, vUv - vec2(uTx.x, 0)).x, r = texture(uP, vUv + vec2(uTx.x, 0)).x;
  float b = texture(uP, vUv - vec2(0, uTx.y)).x, t = texture(uP, vUv + vec2(0, uTx.y)).x;
  o = vec4(texture(uVel, vUv).xy - 0.5 * vec2(r - l, t - b), 0, 1);
}`;

/* --- the brush: one stroke segment of a bristle tip --- */
const BRUSH = HEAD + /* glsl */ `
uniform sampler2D uInk, uPaper;
uniform vec2 uA, uB;
uniform float uR, uAspect, uPig, uWater, uDry, uAlong, uSeed, uCap, uDrop;
void main() {
  vec4 k = texture(uInk, vUv);
  vec4 pp = texture(uPaper, vUv);
  vec2 p = vUv * vec2(uAspect, 1.0);
  if (uDrop > 0.0) {
    // a drop of ink: a wet, uneven blot that blooms through the fibres
    float d = length(p - uA) / uR;
    float edge = 0.75 + 0.35 * (noise(p * 38.0 / uR * 0.05 + uSeed) - 0.5);
    float m = 1.0 - smoothstep(edge - 0.25, edge, d);
    k.r = min(k.r + uPig * m, 4.0);
    k.g = min(k.g + uWater * m, 1.4);
    o = k;
    return;
  }
  vec2 ab = uB - uA;
  float L = length(ab);
  vec2 dir = L > 1e-6 ? ab / L : vec2(1, 0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 ap = p - uA;
  float t = dot(ap, dir);
  float s = dot(ap, nrm) / uR;
  float m = 1.0 - smoothstep(0.62, 1.0, abs(s));
  // the deposit is integrated along the stroke, not stamped: each segment owns a smooth window
  // tanh((L - t)/σ) + tanh(t/σ), and consecutive windows telescope to exactly 1, so a stroke is
  // seamless no matter how it was split into segments (no beads at joints, no gaps on curves)
  float sig = 0.3 * uR;
  // (arguments clamped: tanh overflows to NaN on some GL drivers)
  float win = 0.5 * (tanh(clamp((L - t) / sig, -6.0, 6.0)) + tanh(clamp(t / sig, -6.0, 6.0)));
  float mw = m * win;
  if (mw <= 0.0005) { o = k; return; }
  float along = (uAlong + t) / uR;
  // bristles: streaks across the tip that persist along the stroke
  float b = 0.62 * noise(vec2(s * 7.5 + uSeed, along * 0.11)) + 0.38 * noise(vec2(s * 21.0 - uSeed, along * 0.35));
  float dry = clamp(uDry + 0.45 * s * s * uDry + 0.25 * uDry, 0.0, 1.0);
  float keep = smoothstep(dry - 0.14, dry + 0.05, b + 0.18 * (1.0 - uDry));
  // a dry brush only touches the tops of the paper
  keep *= mix(1.0, smoothstep(0.32, 0.62, pp.r + 0.15 * b), smoothstep(0.25, 0.75, uDry));
  float w = mw * keep;
  k.r = min(k.r + uPig * w * (0.3 + 1.25 * b * b), 4.0);
  float wt = uWater * m * keep * (0.8 + 0.4 * b);
  k.g = min(k.g + uWater * w, max(k.g, wt));
  o = k;
}`;

/* --- percolation, evaporation, fixing --- */
const INK = HEAD + /* glsl */ `
uniform sampler2D uInk, uVel, uPaper;
uniform vec2 uTx;
uniform float uDt, uFlow, uEvap, uFix, uFade, uAlum, uAlumFade, uAdv, uCap, uCarry;
void main() {
  vec4 here = texture(uInk, vUv);
  vec2 v = texture(uVel, vUv).xy;
  vec4 c = texture(uInk, vUv - v * uDt * uAdv);
  c.b = here.b; c.a = here.a;
  vec4 pp = texture(uPaper, vUv);
  float perm = pp.g;
  float absorb = mix(uAlum, 1.0, pp.a);
  float W = c.g, P = c.r;
  // paper holds water up to its capacity; only the excess percolates on (so blooms stop by themselves)
  float cap = uCap * (0.55 + 0.9 * (1.0 - perm));
  float eC = max(W - cap, 0.0);
  float concC = P / max(W, 1e-3);
  float dW = 0.0, dP = 0.0, gW = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    float wgt = (i % 2 == 0) ? 1.0 : 0.70710678;
    vec2 off = vec2(cos(a), sin(a)) * uTx * ((i % 2 == 0) ? 1.0 : 1.41421356);
    vec4 n = texture(uInk, vUv + off);
    vec4 pn = texture(uPaper, vUv + off);
    float capN = uCap * (0.55 + 0.9 * (1.0 - pn.g));
    float eN = max(n.g - capN, 0.0);
    // conductance through connected fibres
    float k = min(perm, pn.g) * wgt;
    float f = k * (eN - eC);            // > 0 flows in
    dW += f;
    // pigment rides the water, upwind
    dP += f > 0.0 ? f * (n.r / max(n.g, 1e-3)) * uCarry : f * concC * uCarry;
    // plain pigment diffusion inside wet areas (soft tonal blending)
    dP += 0.25 * k * smoothstep(0.05, 0.3, min(W, n.g)) * (n.r - P);
    gW += abs(n.g - W);
  }
  W += uFlow * dW;
  P += uFlow * dP;
  P = max(P, 0.0);
  W = max(W, 0.0);
  float edge = clamp(gW * 5.0, 0.0, 1.0);
  // evaporation, quicker at the thin front
  W = max(0.0, W - uEvap * uDt * (0.6 + 2.4 * edge + 0.4 * (1.0 - perm)));
  // pigment fixes into the fibres; the drying front collects more (edge darkening)
  float rate = uFix * absorb * (0.18 + 3.2 * edge + 6.0 * (1.0 - smoothstep(0.0, 0.12, W)));
  float dep = P * clamp(rate * uDt, 0.0, 1.0);
  P -= dep;
  float B = max(c.b + dep, 0.0);
  // alum-sized paper refuses ink: it beads and lifts away
  float lift = uAlumFade * (1.0 - pp.a) * uDt;
  P *= 1.0 - lift * 1.6;
  B *= 1.0 - lift;
  // time (hero): the paper slowly forgets
  float fade = 1.0 - uFade * uDt;
  P *= fade; B *= fade; W *= mix(1.0, fade, 0.5);
  float A = max(c.a * (1.0 - 0.012 * uDt), smoothstep(0.04, 0.3, W));
  o = vec4(max(P, 0.0), W, B, A);
}`;

/* --- composite: lit paper, ink with granulation and five tones of ink --- */
const RENDER = HEAD + /* glsl */ `
uniform sampler2D uInk, uPaper;
uniform vec2 uTx;
uniform float uTime, uWetShow;
uniform vec3 uPaperCol, uInkCol, uWashCol;
void main() {
  vec4 pp = texture(uPaper, vUv);
  vec4 k = texture(uInk, vUv);
  // lit fibre surface
  float h = pp.r;
  vec2 g = vec2(dFdx(h), dFdy(h));
  vec3 paper = uPaperCol * (0.95 + 0.1 * h);
  paper += vec3(1.0, 0.98, 0.95) * clamp(-g.x * 1.3 + g.y * 1.3, -0.035, 0.045);
  // dried water marks: a faint tide line where the paper was wet
  float ax = texture(uInk, vUv + vec2(uTx.x, 0)).a - texture(uInk, vUv - vec2(uTx.x, 0)).a;
  float ay = texture(uInk, vUv + vec2(0, uTx.y)).a - texture(uInk, vUv - vec2(0, uTx.y)).a;
  float tide = clamp(length(vec2(ax, ay)) * 1.6, 0.0, 1.0) * k.a;
  paper *= 1.0 - 0.035 * tide;
  // ink: fixed pigment sits in the fibres, wet pigment floats; granulation follows the grain
  float gran = 0.8 + 0.4 * pp.b;
  float d = (k.b * mix(0.85, 1.12, h) + 0.75 * k.r) * gran;
  float a = 1.0 - exp(-d * 2.1);
  vec3 inkc = mix(uWashCol, uInkCol, smoothstep(0.18, 0.95, a));
  vec3 col = mix(paper, inkc, a);
  // wet paper darkens and goes a little cool
  float wet = smoothstep(0.0, 0.6, k.g) * uWetShow;
  col *= 1.0 - 0.075 * wet;
  col = mix(col, col * vec3(0.97, 0.985, 1.0), wet);
  // light falloff and a whisper of film grain
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.09 * smoothstep(0.25, 0.95, dot(q, q) * 2.4);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 517.0) - 0.5) * 0.008;
  o = vec4(col, 1.0);
}`;

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** 墨分五色: pigment / water per tone */
export const TONES = {
  焦: { pig: 2.6, water: 0.22 },
  浓: { pig: 1.5, water: 0.42 },
  重: { pig: 0.9, water: 0.6 },
  淡: { pig: 0.42, water: 0.82 },
  清: { pig: 0.16, water: 1.0 },
};

const PRESETS = {
  hero: { radius: 0.03, tone: { pig: 0.7, water: 0.5 }, fade: 0.018, flow: 0.22, cap: 0.26, carry: 0.6, evap: 0.16, fix: 0.55, adv: 1, maxSide: 1100 },
  reveal: { radius: 0.1, tone: { pig: 0.8, water: 0.75 }, fade: 0, flow: 0.22, cap: 0.3, carry: 0.5, evap: 0.2, fix: 0.6, alum: 0.08, alumFade: 0.32, deplete: 0.06, maxDry: 0.35, adv: 1, maxSide: 760 },
  lab: { radius: 0.036, tone: TONES.浓, fade: 0, flow: 0.22, cap: 0.26, carry: 0.6, evap: 0.14, fix: 0.5, adv: 1, maxSide: 900 },
};

export function inkSupported() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = !!(gl && gl.getExtension('EXT_color_buffer_float'));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export class InkPaper {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {HTMLElement} o.host        element that receives pointer input
   * @param {'hover'|'drag'} o.mode     hover paints on move; drag paints while pressed
   * @param {'hero'|'reveal'|'lab'} o.preset
   * @param {(w:number,h:number)=>HTMLCanvasElement|null} [o.mask]  alpha = absorbent paper
   */
  constructor({ canvas, host = canvas, mode = 'hover', preset = 'hero', mask = null, paper = '#ece5d6', ink = '#13110e', wash = '#5e574d', onLoad, onFrame } = {}) {
    this.canvas = canvas;
    this.host = host;
    this.mode = mode;
    this.p = { ...PRESETS[preset] };
    this.tone = { ...this.p.tone };
    this.maskFn = mask;
    this.colors = { paper: hex(paper), ink: hex(ink), wash: hex(wash) };
    this.onLoad = onLoad;
    this.onFrame = onFrame;
    this.seed = Math.random() * 100;
    this.brush = { x: 0, y: 0, tx: 0, ty: 0, load: 1, along: 0, seed: 0, down: false, stroking: false, inside: false, vx: 0, vy: 0, lastMove: 0, cap: true };
    this.queue = [];
    this.running = false;
    this.visible = true;
    this.lastActive = performance.now();
    this.time = 0;
    this.script = null;

    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float targets unavailable');
    this.gl = gl;
    this.progs = {
      paper: this.#prog(PAPER), vsplat: this.#prog(VSPLAT), advect: this.#prog(ADVECT), div: this.#prog(DIV),
      pressure: this.#prog(PRESSURE), grad: this.#prog(GRAD), brush: this.#prog(BRUSH), ink: this.#prog(INK), render: this.#prog(RENDER),
    };
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.#bindInput();
    this.resize(true);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.wake();
    });
    this.io.observe(canvas);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.stop(); });
  }

  /* ------------------------------ GL plumbing ------------------------------ */
  #prog(fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 3).join('\n'));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = { loc: gl.getUniformLocation(p, info.name), type: info.type };
    }
    return { p, u };
  }

  #target(w, h, internal, format, type) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  }
  #pair(w, h, i, f, t) {
    const a = this.#target(w, h, i, f, t), b = this.#target(w, h, i, f, t);
    return { read: a, write: b, swap() { [this.read, this.write] = [this.write, this.read]; } };
  }
  #free(t) {
    if (!t) return;
    const gl = this.gl;
    for (const x of t.read ? [t.read, t.write] : [t]) { gl.deleteTexture(x.tex); gl.deleteFramebuffer(x.fb); }
  }

  #run(name, target, uniforms) {
    const gl = this.gl;
    const { p, u } = this.progs[name];
    gl.useProgram(p);
    let unit = 0;
    for (const [k, v] of Object.entries(uniforms)) {
      const e = u[k];
      if (!e) continue;
      if (e.type === gl.SAMPLER_2D) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v.tex ?? v);
        gl.uniform1i(e.loc, unit++);
      } else if (typeof v === 'number') gl.uniform1f(e.loc, v);
      else if (v.length === 2) gl.uniform2f(e.loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(e.loc, v[0], v[1], v[2]);
    }
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.W, this.H);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  resize(force = false) {
    const gl = this.gl;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    // mobile browsers resize the viewport on scroll: ignore small height-only changes
    if (!force && this.cssW === r.width && Math.abs(this.cssH - r.height) / this.cssH < 0.18) return;
    this.cssW = r.width; this.cssH = r.height;
    this.canvas.width = W; this.canvas.height = H;
    this.W = W; this.H = H;
    this.aspect = W / H;
    const s = Math.min(1, this.p.maxSide / Math.max(r.width, r.height)) * Math.min(dpr, 1.25);
    const dw = Math.max(64, Math.round(r.width * s)), dh = Math.max(64, Math.round(r.height * s));
    const vw = Math.max(32, dw >> 1), vh = Math.max(32, dh >> 1);
    [this.vel, this.pres, this.divT, this.ink, this.paper, this.maskTex].forEach((t) => (t?.tex || t?.read ? this.#free(t) : t && gl.deleteTexture(t)));
    this.vel = this.#pair(vw, vh, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.pres = this.#pair(vw, vh, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.divT = this.#target(vw, vh, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.ink = this.#pair(dw, dh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.paper = this.#target(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.vTx = [1 / vw, 1 / vh];
    this.dTx = [1 / dw, 1 / dh];
    this.dpr = dpr;
    this.#makePaper();
    this.wake();
  }

  #makePaper() {
    const gl = this.gl;
    const maskCanvas = this.maskFn?.(this.W, this.H);
    let maskTex = null;
    if (maskCanvas) {
      maskTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    }
    this.#run('paper', this.paper, { uRes: [this.W, this.H], uScale: this.dpr, uSeed: this.seed % 7, uMask: maskTex || this.ink.read.tex, uHasMask: maskTex ? 1 : 0 });
    if (maskTex) gl.deleteTexture(maskTex);
  }

  /** rebuild the paper (e.g. once a mask font has loaded) */
  refreshPaper() {
    this.#makePaper();
    this.wake();
  }

  /* ------------------------------ input ------------------------------ */
  #toLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  }
  #bindInput() {
    const h = this.host;
    const b = this.brush;
    this.handlers = {
      move: (e) => {
        if (e.pointerType === 'touch' && this.mode === 'hover' && !this.touchPaint) return;
        const list = e.getCoalescedEvents?.() || [e];
        for (const ev of list.length ? list : [e]) {
          const l = this.#toLocal(ev);
          if (!l.inside) continue;
          this.queue.push(l);
        }
        b.inside = true;
        this.wake();
      },
      down: (e) => {
        const l = this.#toLocal(e);
        if (!l.inside) return;
        if (this.mode === 'drag') {
          b.down = true;
          b.x = b.tx = l.x; b.y = b.ty = l.y;
          this.#beginStroke();
          h.setPointerCapture?.(e.pointerId);
        }
        this.downAt = performance.now();
        this.downPos = l;
        this.wake();
      },
      up: (e) => {
        const l = this.#toLocal(e);
        // a click without travel drops ink (hover mode); a long press in drag mode does too
        const still = this.downPos && Math.hypot((l.x - this.downPos.x) * this.aspect, l.y - this.downPos.y) < 0.01;
        if (this.mode === 'hover' && still && l.inside) this.drop(l.x, l.y);
        if (this.mode === 'drag') {
          if (still && b.travel < 0.004) this.drop(l.x, l.y, 0.6);
          b.down = false;
          b.stroking = false;
        }
        this.downPos = null;
      },
      leave: () => { b.inside = false; b.stroking = false; this.queue.length = 0; },
    };
    h.addEventListener('pointermove', this.handlers.move, { passive: true });
    h.addEventListener('pointerdown', this.handlers.down);
    window.addEventListener('pointerup', this.handlers.up);
    h.addEventListener('pointerleave', this.handlers.leave);
  }

  #beginStroke() {
    const b = this.brush;
    b.stroking = true;
    b.along = 0;
    b.travel = 0;
    b.seed = Math.random() * 50;
    b.cap = true;
  }

  /** a drop of ink: blooms outward through the fibres */
  drop(x, y, size = 1) {
    const r = this.p.radius * 1.9 * size * (0.85 + Math.random() * 0.3);
    const A = [x * this.aspect, y];
    this.#run('brush', this.ink.write, { uInk: this.ink.read, uPaper: this.paper, uA: A, uB: A, uR: r, uAspect: this.aspect, uPig: this.tone.pig * 1.6 + 0.6, uWater: 1.25, uDry: 0, uAlong: 0, uSeed: Math.random() * 40, uCap: 1, uDrop: 1 });
    this.ink.swap();
    this.#run('vsplat', this.vel.write, { uVel: this.vel.read, uA: A, uB: A, uForce: [0, 0], uR: r * 1.6, uAspect: this.aspect, uRadial: 0.08 });
    this.vel.swap();
    this.onDrop?.(x, y);
    this.wake();
  }

  setTone(t) { this.tone = { ...(typeof t === 'string' ? TONES[t] : t) }; this.brush.load = 1; }

  clear() {
    const gl = this.gl;
    for (const t of [this.ink.read, this.ink.write, this.vel.read, this.vel.write]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.seed = Math.random() * 100;
    this.#makePaper();
    this.wake();
  }

  /**
   * A scripted stroke (e.g. the hero's ensō). `path(t)` returns [x, y] in 0..1 uv.
   * Ink runs out along the stroke so the tail breaks into flying white.
   */
  stroke(path, { duration = 1.6, ease = (t) => t, radius = 1, tone = null, dryEnd = 0.62 } = {}) {
    return new Promise((resolve) => {
      const [x, y] = path(0);
      Object.assign(this.brush, { x, y, tx: x, ty: y, load: 1 });
      this.#beginStroke();
      this.script = { path, duration, ease, t0: null, radius, tone, dryEnd, resolve };
      this.wake();
    });
  }

  /* ------------------------------ loop ------------------------------ */
  wake() {
    this.lastActive = performance.now();
    if (this.running || !this.visible) return;
    this.running = true;
    this.prev = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(1 / 30, (now - this.prev) / 1000);
      this.prev = now;
      this.step(dt, now);
      // sleep when idle and the paper has dried
      if (!this.visible || (now - this.lastActive > 9000 && !this.script)) { this.running = false; return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  #brushStep(dt, now) {
    const b = this.brush;
    const P = this.p;
    let radiusMul = 1, tone = this.tone, forcedDry = null;

    let pts = null;
    if (this.script) {
      const s = this.script;
      if (s.t0 == null) { s.t0 = now; s.last = 0; }
      const t = Math.min(1, (now - s.t0) / 1000 / s.duration);
      // sample the path between frames so curves stay curves even at low frame rates
      const steps = Math.max(1, Math.min(32, Math.ceil((t - s.last) * 90)));
      pts = [];
      for (let i = 1; i <= steps; i++) pts.push(s.path(s.ease(s.last + ((t - s.last) * i) / steps)));
      s.last = t;
      const [x, y] = pts[pts.length - 1];
      b.tx = x; b.ty = y;
      radiusMul = s.radius * (0.55 + 0.45 * Math.sin(Math.min(1, t * 6) * Math.PI / 2)) * (1 - 0.35 * t);
      if (s.tone) tone = s.tone;
      forcedDry = Math.pow(Math.max(0, (t - 0.5) / 0.5), 1.4) * s.dryEnd;
      b.stroking = true;
      if (t >= 1) { this.script = null; b.stroking = false; this.queue.length = 0; s.resolve(); }
    } else if (this.queue.length) {
      const l = this.queue[this.queue.length - 1];
      this.queue.length = 0;
      if (this.mode === 'hover') {
        if (!b.stroking) { b.x = l.x; b.y = l.y; this.#beginStroke(); }
      }
      b.tx = l.x; b.ty = l.y;
      b.lastMove = now;
    }

    // hover brush lifts when it rests and slowly re-inks (蘸墨)
    const resting = now - b.lastMove > 140 && !this.script;
    if (this.mode === 'hover' && resting) b.stroking = false;
    if (resting || (this.mode === 'drag' && !b.down)) b.load = Math.min(1, b.load + dt * 0.9);

    const painting = this.script || (this.mode === 'hover' ? b.stroking : b.down && b.stroking);
    // the tip trails the hand a little: smoother, more calligraphic curves
    const follow = pts ? 1 : 1 - Math.pow(0.0008, dt);
    const nx = b.x + (b.tx - b.x) * follow, ny = b.y + (b.ty - b.y) * follow;
    const dx = (nx - b.x) * this.aspect, dy = ny - b.y;
    const len = Math.hypot(dx, dy);
    // real elapsed time, so a slow frame doesn't read as a fast flick
    const rdt = Math.min(0.25, Math.max(dt, (now - (this.lastNow ?? now)) / 1000));
    this.lastNow = now;
    const speed = len / Math.max(rdt, 1e-4); // screen-heights per second
    b.vx = b.vx * 0.7 + (dx / Math.max(rdt, 1e-4)) * 0.3;
    b.vy = b.vy * 0.7 + (dy / Math.max(rdt, 1e-4)) * 0.3;
    if (!painting || len < 1e-5) { b.x = nx; b.y = ny; return false; }

    const sp = Math.min(1, speed / 2.4);
    const startPress = Math.min(1, 0.45 + b.along / (P.radius * 3));
    const r = P.radius * radiusMul * (0.6 + 0.5 * b.load) * (1.12 - 0.5 * sp) * startPress;
    const dry = forcedDry ?? Math.max(0, Math.min(P.maxDry ?? 0.8, (1 - b.load) * 0.9 + sp * 0.6 - 0.14));
    // subdivide so fast strokes stay continuous
    const poly = pts ? [[b.x, b.y], ...pts] : [[b.x, b.y], [nx, ny]];
    let budget = 48;
    for (let j = 0; j < poly.length - 1 && budget > 0; j++) {
      const [x0, y0] = poly[j], [x1, y1] = poly[j + 1];
      const l = Math.hypot((x1 - x0) * this.aspect, y1 - y0);
      if (l < 1e-6) continue;
      const n = Math.min(budget, Math.max(1, Math.ceil(l / (r * 0.6))));
      budget -= n;
      for (let i = 0; i < n; i++) {
        const A = [(x0 + ((x1 - x0) * i) / n) * this.aspect, y0 + ((y1 - y0) * i) / n];
        const B = [(x0 + ((x1 - x0) * (i + 1)) / n) * this.aspect, y0 + ((y1 - y0) * (i + 1)) / n];
        this.#run('brush', this.ink.write, {
          uInk: this.ink.read, uPaper: this.paper, uA: A, uB: B, uR: r, uAspect: this.aspect,
          uPig: tone.pig * (0.45 + 0.55 * b.load), uWater: tone.water * (0.35 + 0.65 * b.load) * (1 - 0.4 * sp),
          uDry: dry, uAlong: b.along, uSeed: b.seed, uCap: b.cap ? 1 : 0, uDrop: 0,
        });
        this.ink.swap();
        b.cap = false;
        b.along += l / n;
      }
    }
    // the brush drags water with it
    this.#run('vsplat', this.vel.write, { uVel: this.vel.read, uA: [b.x * this.aspect, b.y], uB: [nx * this.aspect, ny], uForce: [Math.max(-2, Math.min(2, b.vx)) * 0.025, Math.max(-2, Math.min(2, b.vy)) * 0.025], uR: r * 1.2, uAspect: this.aspect, uRadial: 0 });
    this.vel.swap();
    b.travel = (b.travel || 0) + len;
    // ink runs out with distance
    b.load = Math.max(0, b.load - len * (this.script ? 0 : P.deplete ?? 0.55));
    b.x = nx; b.y = ny;
    return true;
  }

  step(dt, now = performance.now()) {
    this.time += dt;
    const P = this.p;
    if (this.#brushStep(dt, now)) this.lastActive = now;

    // fluid
    this.#run('advect', this.vel.write, { uVel: this.vel.read, uSrc: this.vel.read, uDt: dt, uDiss: 0.965 });
    this.vel.swap();
    this.#run('div', this.divT, { uVel: this.vel.read, uTx: this.vTx });
    for (let i = 0; i < 12; i++) {
      this.#run('pressure', this.pres.write, { uP: this.pres.read, uDiv: this.divT, uTx: this.vTx });
      this.pres.swap();
    }
    this.#run('grad', this.vel.write, { uP: this.pres.read, uVel: this.vel.read, uTx: this.vTx });
    this.vel.swap();

    // ink percolation: two sub-steps per frame
    for (let i = 0; i < 2; i++) {
      this.#run('ink', this.ink.write, {
        uInk: this.ink.read, uVel: this.vel.read, uPaper: this.paper, uTx: this.dTx, uDt: dt * 0.5,
        uFlow: P.flow, uCap: P.cap, uCarry: P.carry, uEvap: P.evap, uFix: P.fix, uFade: P.fade, uAlum: P.alum ?? 1, uAlumFade: P.alumFade ?? 0, uAdv: P.adv,
      });
      this.ink.swap();
    }
    this.draw();
    this.onFrame?.(this);
  }

  draw() {
    const c = this.colors;
    this.#run('render', null, { uInk: this.ink.read, uPaper: this.paper, uTx: this.dTx, uTime: this.time, uWetShow: 1, uPaperCol: c.paper, uInkCol: c.ink, uWashCol: c.wash });
  }

  destroy() {
    this.stop();
    this.ro?.disconnect();
    this.io?.disconnect();
    const h = this.host, x = this.handlers;
    h.removeEventListener('pointermove', x.move);
    h.removeEventListener('pointerdown', x.down);
    window.removeEventListener('pointerup', x.up);
    h.removeEventListener('pointerleave', x.leave);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
