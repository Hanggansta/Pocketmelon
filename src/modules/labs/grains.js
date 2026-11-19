import { GL, HEAD, visibleLoop } from '../gl/gl2.js';

/**
 * 万粒 — 131,072 grains of ink dust (GPU particles, WebGL2).
 * Each grain has a home inside a character. Between characters they ride curl-noise
 * currents; the cursor is a vortex that tears the character apart. Click for the next one.
 * Grains render additively into a feedback buffer that fades each frame, so fast grains
 * leave silk-thin streaks.
 */
const UPDATE = HEAD + `
uniform sampler2D uState, uHome;
uniform vec2 uMouse, uMouseV; uniform float uDt, uTime, uForm, uAspect, uPower, uBurst;
vec2 curl(vec2 p) {
  float e = 0.01;
  float a = fbm(p + vec2(0, e)), b = fbm(p - vec2(0, e)), c = fbm(p + vec2(e, 0)), d = fbm(p - vec2(e, 0));
  return vec2(a - b, -(c - d)) / (2.0 * e);
}
void main() {
  vec4 s = texture(uState, vUv);
  vec2 p = s.xy, v = s.zw;
  vec4 h = texture(uHome, vUv);
  float id = h.z;
  // spring home, each grain at its own stiffness so the character assembles in waves
  float k = mix(6.0, 22.0, fract(id * 7.31)) * uForm;
  vec2 toHome = h.xy - p;
  vec2 acc = toHome * k - v * mix(1.2, 5.5, uForm);
  // currents
  vec2 q = p * vec2(uAspect, 1.0);
  acc += curl(q * 1.8 + vec2(uTime * 0.05, id)) * mix(0.9, 0.05, uForm);
  // cursor vortex: swirl + push, scaled by cursor speed
  vec2 dm = (p - uMouse) * vec2(uAspect, 1.0);
  float r2 = dot(dm, dm);
  float fall = exp(-r2 / 0.012);
  vec2 tang = vec2(-dm.y, dm.x) / uAspect;
  acc += (tang * 9.0 + dm / max(1e-3, sqrt(r2)) * 2.5 / vec2(uAspect, 1.0)) * fall * uPower;
  acc += uMouseV * fall * 60.0;
  // burst on click: blow outward from the centre
  vec2 dc = (p - 0.5) * vec2(uAspect, 1.0);
  acc += normalize(dc + 1e-4) * uBurst * (0.6 + fract(id * 13.7)) * 3.0 / vec2(uAspect, 1.0);
  v += acc * uDt;
  p += v * uDt;
  o = vec4(p, v);
}`;

const POINT_VS = `#version 300 es
precision highp float;
uniform sampler2D uState; uniform ivec2 uSize; uniform float uPx;
out float vSpeed; out float vId;
void main() {
  ivec2 c = ivec2(gl_VertexID % uSize.x, gl_VertexID / uSize.x);
  vec4 s = texelFetch(uState, c, 0);
  vSpeed = length(s.zw);
  vId = fract(float(gl_VertexID) * 0.618034);
  gl_Position = vec4(s.xy * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uPx * (0.8 + vId * 0.9);
}`;
const POINT_FS = `#version 300 es
precision highp float;
in float vSpeed; in float vId; out vec4 o;
uniform float uGain;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  vec3 bone = vec3(0.93, 0.9, 0.84);
  vec3 cinn = vec3(1.0, 0.32, 0.2);
  float hot = smoothstep(0.35, 1.6, vSpeed) * step(0.86, vId);
  vec3 col = mix(bone, cinn, hot);
  o = vec4(col * a * uGain * (0.55 + 0.6 * vId), 1.0);
}`;
const FADE = HEAD + `
uniform sampler2D uTex; uniform float uKeep;
void main() { o = texture(uTex, vUv) * uKeep; }`;
const PRESENT = HEAD + `
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  c = 1.0 - exp(-c * 1.4); // tone map
  vec3 bg = vec3(0.039, 0.043, 0.051);
  vec2 q = vUv - 0.5;
  bg *= 1.0 - 0.45 * dot(q, q);
  c = bg + c * (1.0 - bg);
  c += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.03;
  o = vec4(c, 1.0);
}`;

const CHARS = ['墨', '山', '水', '风', '月', '品', '瓜', '梦'];

export function initGrains(stage, { fontsReady = Promise.resolve() } = {}) {
  const canvas = stage?.querySelector('canvas');
  if (!canvas) return null;
  let g;
  try {
    g = new GL(canvas);
    if (!g.float) throw new Error('no float');
  } catch {
    stage.classList.add('no-gl');
    return null;
  }
  stage.classList.add('has-gl');
  const gl = g.gl;
  const small = matchMedia('(max-width: 900px)').matches;
  const SW = 512, SH = small ? 128 : 256, N = SW * SH;
  const pUpdate = g.program(UPDATE), pPoint = g.program(POINT_FS, POINT_VS), pFade = g.program(FADE), pPresent = g.program(PRESENT);
  const state = g.pair(SW, SH, { internal: gl.RGBA32F, type: gl.FLOAT, filter: gl.NEAREST });
  let accum = null;
  const homeTex = gl.createTexture();
  const vao = gl.createVertexArray();

  const font = '"KingHwa_OldSong", "Noto Serif SC Variable", serif';
  let idx = 0;
  let aspect = 1;

  function fit() {
    g.fit(1.5);
    const r = canvas.getBoundingClientRect();
    aspect = r.width / r.height;
    g.free(accum);
    accum = g.pair(canvas.width, canvas.height);
  }

  /** sample N home positions inside a character */
  function setChar(ch) {
    const H = 320, W = Math.round(H * aspect);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff';
    x.font = `${H * 0.78}px ${font}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, W / 2, H * 0.53);
    const data = x.getImageData(0, 0, W, H).data;
    const pts = [];
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) if (data[(y * W + i) * 4 + 3] > 140) pts.push(i, y);
    const home = new Float32Array(N * 4);
    const n = pts.length / 2 || 1;
    for (let i = 0; i < N; i++) {
      const j = ((Math.random() * n) | 0) * 2;
      home[i * 4] = (pts[j] + Math.random()) / W;
      home[i * 4 + 1] = 1 - (pts[j + 1] + Math.random()) / H;
      home[i * 4 + 2] = Math.random();
      home[i * 4 + 3] = 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, homeTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SW, SH, 0, gl.RGBA, gl.FLOAT, home);
  }

  function scatter() {
    const s = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      s[i * 4] = Math.random();
      s[i * 4 + 1] = Math.random();
    }
    for (const t of [state.read, state.write]) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SW, SH, 0, gl.RGBA, gl.FLOAT, s);
    }
  }

  fit();
  scatter();
  setChar(CHARS[0]);
  fontsReady.then(async () => {
    for (let i = 0; i < 20; i++) {
      if ((await document.fonts.load(`100px ${font}`, CHARS.join(''))).length) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    setChar(CHARS[idx]);
  }).catch(() => {});
  new ResizeObserver(() => { fit(); setChar(CHARS[idx]); }).observe(canvas);

  // input
  const m = { x: -1, y: -1, vx: 0, vy: 0, power: 0, burst: 0, idle: 0 };
  let form = 0, formTarget = 1, time = 0, last = null;
  stage.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (last) { m.vx = x - last.x; m.vy = y - last.y; }
    last = { x, y };
    m.x = x; m.y = y;
    m.power = Math.min(1, m.power + Math.hypot(m.vx * aspect, m.vy) * 30);
    m.idle = 0;
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { last = null; m.x = m.y = -1; });
  const next = () => {
    idx = (idx + 1) % CHARS.length;
    m.burst = 1;
    form = 0;
    setTimeout(() => setChar(CHARS[idx]), 120);
    m.idle = 0;
  };
  stage.addEventListener('click', next);

  visibleLoop(stage, (dt) => {
    time += dt;
    m.idle += dt;
    if (m.idle > 7) next();
    form += (formTarget - form) * Math.min(1, dt * 0.9);
    m.power *= Math.pow(0.04, dt);
    m.burst *= Math.pow(0.002, dt);
    const sub = 2;
    for (let i = 0; i < sub; i++) {
      g.run(pUpdate, state.write, {
        uState: state, uHome: homeTex, uMouse: [m.x, m.y], uMouseV: [m.vx, m.vy], uDt: dt / sub, uTime: time,
        uForm: form, uAspect: aspect, uPower: m.power, uBurst: m.burst,
      });
      state.swap();
    }
    m.vx *= 0.5; m.vy *= 0.5;
    // trails: fade the accumulation, then add this frame's grains
    g.run(pFade, accum.write, { uTex: accum, uKeep: 0.82 });
    accum.swap();
    gl.useProgram(pPoint.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.read.fb);
    gl.viewport(0, 0, accum.w, accum.h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.read.tex);
    gl.uniform1i(pPoint.u.uState.loc, 0);
    gl.uniform2i(pPoint.u.uSize.loc, SW, SH);
    gl.uniform1f(pPoint.u.uPx.loc, Math.max(1, canvas.width / 900));
    gl.uniform1f(pPoint.u.uGain.loc, small ? 0.16 : 0.09);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    g.run(pPresent, null, { uTex: accum, uRes: [canvas.width, canvas.height], uTime: time });
  });
  return { next };
}
