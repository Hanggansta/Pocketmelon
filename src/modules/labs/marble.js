import { GL, HEAD, visibleLoop } from '../gl/gl2.js';

/**
 * 流沙笺 — Song-dynasty marbled letter paper, made with exact marbling maths
 * (Jaffer & Lu, "Mathematical Marbling", 2012), on the GPU.
 *
 * Every drop is an area-preserving map: a point p outside a drop of radius r centred at c
 * moves to c + (p − c)·√(1 + r²/|p − c|²). We render by inverting it each frame, so the
 * pattern is resampled rather than simulated — rings stay perfectly concentric and nest.
 * Holding the button keeps dropping (ink and clear water alternate, as in suminagashi);
 * dragging combs the floating ink with a stylus (a smooth, area-preserving shear).
 */
/*
 * Exact evaluation: for every pixel, walk the operation list backwards applying each inverse map,
 * until the point lands inside a drop (that drop's colour) or falls off the start (the base layer).
 * Nothing is ever resampled, so lines stay razor sharp. Ops live in a float texture, 2 texels each:
 *   drop: [0, cx, cy, r] [R, G, B, 0]       comb: [1, ax, ay, w] [bx, by, 0, 0]
 * When the list grows long it is baked into the base layer.
 */
const EVAL = HEAD + `
uniform sampler2D uOps, uBase; uniform int uCount; uniform float uAspect;
void main() {
  vec2 S = vec2(uAspect, 1.0);
  vec2 p = vUv * S;
  vec3 col = vec3(-1.0);
  float edge = 1.0;
  for (int i = 0; i < 512; i++) {
    int k = uCount - 1 - i;
    if (k < 0) break;
    vec4 a = texelFetch(uOps, ivec2(k * 2, 0), 0);
    vec4 b = texelFetch(uOps, ivec2(k * 2 + 1, 0), 0);
    if (a.x < 0.5) {
      vec2 c = a.yz * S;
      vec2 d = p - c;
      float l2 = dot(d, d), r2 = a.w * a.w;
      if (l2 < r2) { col = b.rgb; break; }
      p = c + d * sqrt(1.0 - r2 / l2);
    } else {
      vec2 A = a.yz * S, B = b.xy * S;
      vec2 m = B - A;
      float L = length(m);
      if (L < 1e-6) continue;
      vec2 u = m / L, ap = p - A;
      float t = clamp(dot(ap, u) / L, 0.0, 1.0);
      float dist = length(ap - u * t * L);
      float kk = a.w / (dist + a.w);
      p -= m * kk * kk;
    }
  }
  if (col.r < 0.0) col = texture(uBase, p / S).rgb;
  o = vec4(col, 1.0);
}`;

const COPY = HEAD + `
uniform sampler2D uTex;
void main() { o = texture(uTex, vUv); }`;

const PRESENT = HEAD + `
uniform sampler2D uTex; uniform vec2 uRes, uTx; uniform float uTime, uAspect;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  // pigment floats: a hint of relief at colour edges
  float l = dot(texture(uTex, vUv - vec2(uTx.x, 0)).rgb, vec3(0.333));
  float r = dot(texture(uTex, vUv + vec2(uTx.x, 0)).rgb, vec3(0.333));
  float b = dot(texture(uTex, vUv - vec2(0, uTx.y)).rgb, vec3(0.333));
  float t = dot(texture(uTex, vUv + vec2(0, uTx.y)).rgb, vec3(0.333));
  c *= 1.0 + ((l - r) - (b - t)) * 0.35;
  // laid paper: chain lines and fibre
  vec2 q = vUv * vec2(uAspect, 1.0);
  float fib = fbm(q * vec2(140.0, 22.0)) * 0.025 + fbm(q * 40.0) * 0.03;
  float chain = smoothstep(0.992, 1.0, abs(sin(q.x * 3.14159 * 7.0))) * 0.012;
  c *= 1.0 - fib - chain + 0.04;
  c += (hash(vUv * uRes + fract(uTime) * 51.0) - 0.5) * 0.025;
  o = vec4(c, 1.0);
}`;

const PAPER = [0.93, 0.9, 0.84];
const PALETTE = [
  [0.07, 0.07, 0.08], // 墨
  [0.62, 0.6, 0.57], // 淡墨
  [0.72, 0.2, 0.16], // 朱
  [0.16, 0.25, 0.4], // 黛
];

export function initMarble(stage) {
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
  const pEval = g.program(EVAL), pCopy = g.program(COPY), pPresent = g.program(PRESENT);
  const MAX = 512;
  const ops = new Float32Array(MAX * 8);
  let count = 0, dirty = true;
  const opsTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, opsTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX * 2, 1, 0, gl.RGBA, gl.FLOAT, ops);
  let base = null, pattern = null, aspect = 1;
  const queue = [];

  function clearBase() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, base.read.fb);
    gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function fit() {
    if (!g.fit(1.5) && pattern) return;
    const r = canvas.getBoundingClientRect();
    aspect = r.width / r.height;
    // evaluate at 1.5× and filter down: free anti-aliasing for the hard drop edges
    const H = Math.round(canvas.height * 1.5), W = Math.round(H * aspect);
    g.free(pattern); g.free(base);
    pattern = g.target(W, H);
    base = g.pair(W, H);
    clearBase();
    dirty = true;
  }
  function evaluate(target, n) {
    gl.useProgram(pEval.p);
    gl.uniform1i(pEval.u.uCount.loc, n);
    g.run(pEval, target, { uOps: opsTex, uBase: base, uAspect: aspect });
  }
  function push(op) {
    if (count >= MAX) {
      // fold the list into the base layer and start over
      evaluate(base.write, count);
      base.swap();
      count = 0;
    }
    ops.set(op, count * 8);
    gl.bindTexture(gl.TEXTURE_2D, opsTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, count * 2, 0, 2, 1, gl.RGBA, gl.FLOAT, ops, count * 8);
    count++;
    dirty = true;
  }
  const drop = (c, r, col) => push([0, c[0], c[1], r, col[0], col[1], col[2], 0]);
  const comb = (a, b, w) => push([1, a[0], a[1], w, b[0], b[1], 0, 0]);

  // one suminagashi sequence so the paper is never blank
  function demo() {
    const c = [0.42, 0.55];
    for (let i = 0; i < 30; i++) queue.push(() => drop(c, 0.05 - i * 0.0006, i % 2 ? PAPER : i % 8 === 6 ? PALETTE[1] : i === 21 ? PALETTE[2] : PALETTE[0]));
    const c2 = [0.8, 0.3];
    for (let i = 0; i < 14; i++) queue.push(() => drop(c2, 0.035, i % 2 ? PAPER : i % 4 === 2 ? PALETTE[1] : PALETTE[3]));
    let k = 0;
    for (let x = -0.05; x <= 1.05; x += 0.025) { const y = 0.38 + Math.sin(k * 0.35) * 0.05, y2 = 0.38 + Math.sin(++k * 0.35) * 0.05, xx = x; queue.push(() => comb([xx, y], [xx + 0.025, y2], 0.05)); }
    for (let x = 1.05; x >= -0.05; x -= 0.025) { const y = 0.7 + Math.sin(k * 0.3) * 0.06, y2 = 0.7 + Math.sin(++k * 0.3) * 0.06, xx = x; queue.push(() => comb([xx, y], [xx - 0.025, y2], 0.05)); }
  }

  fit();
  demo();
  new ResizeObserver(() => fit()).observe(canvas);

  // input: hold to keep dropping, drag to comb
  let down = null, colorIdx = 0, inkTurn = true, holdT = 0, last = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    down = { p: pos(e), moved: false };
    last = down.p;
    holdT = 0;
    inkTurn = true;
    drop(down.p, 0.04, PALETTE[colorIdx]);
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!down) return;
    const p = pos(e);
    if (Math.hypot((p[0] - last[0]) * aspect, p[1] - last[1]) > 0.006) {
      down.moved = true;
      comb(last, p, 0.035);
      last = p;
    }
  });
  const up = () => { down = null; };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.querySelectorAll('[data-pig]').forEach((b) =>
    b.addEventListener('click', () => {
      colorIdx = +b.dataset.pig;
      stage.querySelectorAll('[data-pig]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    })
  );
  stage.querySelector('[data-marble-clear]')?.addEventListener('click', () => {
    queue.length = 0;
    count = 0;
    clearBase();
    dirty = true;
    demo();
  });

  let time = 0;
  visibleLoop(stage, (dt) => {
    time += dt;
    if (down && !down.moved) {
      holdT += dt;
      if (holdT > 0.14) {
        holdT = 0;
        inkTurn = !inkTurn;
        drop(down.p, 0.03, inkTurn ? PALETTE[colorIdx] : PAPER);
      }
    }
    for (const f of queue.splice(0, 6)) f();
    if (dirty) {
      evaluate(pattern, count);
      dirty = false;
    }
    g.run(pPresent, null, { uTex: pattern, uRes: [canvas.width, canvas.height], uTx: [1 / pattern.w, 1 / pattern.h], uTime: time, uAspect: aspect });
  });
  return {};
}
