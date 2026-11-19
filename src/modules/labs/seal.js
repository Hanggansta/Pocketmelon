import { GL, HEAD, visibleLoop } from '../gl/gl2.js';

/**
 * 玉印 — a jade seal, ray-marched (signed distance fields, no meshes).
 * The face is carved in relief (朱文) from a glyph texture and inked with cinnabar paste.
 * Jade is lit with a cheap subsurface model: each pixel marches *inside* the stone to measure
 * its thickness toward the light, through drifting cloud-like inclusions, and tints by Beer's law.
 * Drag to turn it in your hand; click to change stone (羊脂白玉 / 碧玉 / 墨玉).
 */
const FS = HEAD + `
uniform sampler2D uFace;
uniform vec2 uRes; uniform float uTime; uniform mat3 uRot;
uniform vec3 uJade, uAbs; uniform float uDark;

const float H = 0.8;      // half height
const float W = 0.52;     // half width
const float RELIEF = 0.035;

float sdBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xy) - t.x, p.z); return length(q) - t.y; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

float face(vec2 xz) {
  vec2 uv = xz / (2.0 * W) + 0.5;
  return texture(uFace, uv).a;
}

// 0 = stone, 1 = relief (the inked part)
float map(vec3 p, out float mat) {
  mat = 0.0;
  // body: slightly tapered column
  vec3 q = p;
  q.xz *= 1.0 + 0.06 * (q.y / H);
  float body = sdBox(q - vec3(0, RELIEF * 0.5, 0), vec3(W, H - RELIEF * 0.5, W), 0.07);
  // shoulder + knob: a pierced loop, as on a 鼻钮 seal
  float dome = length((p - vec3(0, H - 0.05, 0)) * vec3(1.0, 1.9, 1.0)) - 0.42;
  float loop = sdTorus(p - vec3(0, H + 0.22, 0), vec2(0.2, 0.075));
  float d = smin(body, dome, 0.12);
  d = smin(d, loop, 0.08);
  // relief: raised glyph strokes on the face, at y in [-H, -H + RELIEF]
  if (p.y < -H + RELIEF + 0.05 && abs(p.x) < W && abs(p.z) < W) {
    float m = face(p.xz);
    float layer = max(p.y - (-H + RELIEF), -H - p.y);
    float stroke = max(layer, (0.5 - m) * 0.03);
    stroke = max(stroke, max(abs(p.x), abs(p.z)) - W + 0.04);
    if (stroke < d) { d = stroke; mat = 1.0; }
  }
  return d;
}
float map(vec3 p) { float m; return map(p, m); }

vec3 normal(vec3 p) {
  vec2 e = vec2(0.0015, 0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

// studio: one big soft box above-left, a warm card right, dark floor
vec3 env(vec3 d) {
  vec3 c = mix(vec3(0.05, 0.045, 0.04), vec3(0.22, 0.2, 0.19), smoothstep(-0.4, 0.8, d.y));
  c += vec3(1.0, 0.97, 0.92) * 2.2 * smoothstep(0.86, 0.95, dot(d, normalize(vec3(-0.5, 0.8, 0.35))));
  c += vec3(1.0, 0.75, 0.55) * 0.6 * smoothstep(0.75, 0.95, dot(d, normalize(vec3(0.9, 0.1, -0.2))));
  return c;
}

float inclusions(vec3 p) {
  return smoothstep(0.45, 0.85, fbm(p.xz * 2.3 + p.y * 1.7 + vec2(fbm(p.yx * 3.0)) * 1.5));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = uRot * vec3(0, 0, 4.4) + vec3(0, 0.12, 0);
  vec3 rd = uRot * normalize(vec3(uv, -1.75));
  // backdrop
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  vec3 col = mix(vec3(0.075, 0.07, 0.066), vec3(0.025, 0.024, 0.023), length(q * vec2(uRes.x / uRes.y, 1.0)) * 1.2);
  float t = 0.0, mat = 0.0;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    float d = map(p, mat);
    if (d < 0.0008) { hit = true; break; }
    t += d * 0.85;
    if (t > 7.0) break;
  }
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normal(p);
    vec3 L = normalize(vec3(-0.5, 0.8, 0.35));
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 5.0) * 0.96 + 0.04;
    vec3 refl = env(reflect(rd, n));
    if (mat > 0.5) {
      // cinnabar paste: matte, slightly granular
      float gr = noise(p.xz * 180.0);
      vec3 red = vec3(0.62, 0.12, 0.08) * (0.75 + 0.35 * gr);
      col = red * (0.25 + 0.9 * max(dot(n, L), 0.0)) + refl * fres * 0.25;
    } else {
      // subsurface: march inside along the refracted ray, collecting thickness and inclusions
      vec3 r = refract(rd, n, 1.0 / 1.61);
      float th = 0.0, cloud = 0.0, s = 0.02;
      vec3 pi = p;
      for (int j = 0; j < 28; j++) {
        pi = p + r * s;
        float d = map(pi);
        if (d > 0.0) break;
        float stepL = max(0.03, -d * 0.8);
        cloud += inclusions(pi * 1.3) * stepL;
        th += stepL;
        s += stepL;
      }
      // light reaching the exit point from the key light (cheap: thickness toward L)
      float tl = 0.0;
      for (int k = 1; k <= 6; k++) { float h = float(k) * 0.08; tl += max(0.0, -map(p - n * 0.02 + L * h)); }
      vec3 trans = exp(-uAbs * (th * 1.3 + cloud * 2.4 + tl * 1.2));
      vec3 back = env(r) * 0.6 + vec3(1.0, 0.96, 0.9) * 0.55;
      float wrap = max(0.0, (dot(n, L) + 0.6) / 1.6);
      vec3 body = uJade * (0.22 + 0.6 * wrap) * 0.7 + back * trans * uJade * 1.5;
      // light pooling inside the stone near thin edges
      body += uJade * vec3(1.0, 0.92, 0.8) * 0.35 * exp(-th * 1.5);
      body = mix(body, body * vec3(0.85, 0.82, 0.78), cloud * 0.4);
      col = mix(body, refl, fres);
      // polished highlight
      col += vec3(1.0, 0.98, 0.94) * pow(max(dot(reflect(rd, n), L), 0.0), 120.0) * 1.6;
    }
    col = mix(col, col * uDark, 0.0);
  }
  // soft contact shadow / floor glow under the seal
  col += vec3(0.6, 0.18, 0.1) * 0.05 * exp(-dot(q - vec2(0, -0.42), q - vec2(0, -0.42)) * 30.0);
  col = col / (1.0 + col * 0.35); // gentle tone map
  col = pow(col, vec3(0.92));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 37.0) - 0.5) * 0.02;
  o = vec4(col, 1.0);
}`;

const STONES = [
  { name: '羊脂', jade: [0.96, 0.92, 0.82], abs: [0.35, 0.45, 0.75] },
  { name: '碧玉', jade: [0.4, 0.75, 0.5], abs: [1.6, 0.45, 1.2] },
  { name: '墨玉', jade: [0.16, 0.17, 0.16], abs: [3.5, 3.3, 3.2] },
];

export function initSeal(stage, { fontsReady = Promise.resolve() } = {}) {
  const canvas = stage?.querySelector('canvas');
  if (!canvas) return null;
  let g;
  try {
    g = new GL(canvas);
  } catch {
    stage.classList.add('no-gl');
    return null;
  }
  stage.classList.add('has-gl');
  const gl = g.gl;
  const prog = g.program(FS);
  let faceTex = null;

  const font = '"KingHwa_OldSong", "Noto Serif SC Variable", serif';
  function drawFace() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.strokeStyle = '#fff';
    // border
    x.lineWidth = S * 0.05;
    x.strokeRect(S * 0.07, S * 0.07, S * 0.86, S * 0.86);
    // 口袋 right column, 瓜印 left column; mirrored, as a seal is carved
    x.translate(S, 0);
    x.scale(-1, 1);
    x.font = `${S * 0.36}px ${font}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const cell = (ch, cx, cy) => x.fillText(ch, S * cx, S * cy);
    cell('口', 0.71, 0.3);
    cell('袋', 0.71, 0.7);
    cell('瓜', 0.29, 0.3);
    cell('印', 0.29, 0.7);
    if (faceTex) gl.deleteTexture(faceTex);
    faceTex = g.texture(c, { flip: false });
  }
  drawFace();
  fontsReady.then(async () => {
    for (let i = 0; i < 20; i++) {
      if ((await document.fonts.load(`100px ${font}`, '口袋瓜印')).length) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    drawFace();
  }).catch(() => {});

  // orientation with inertia
  const rot = { yaw: 0.7, pitch: 0.62, vy: 0.18, vp: 0 };
  let drag = null, moved = 0, stone = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    drag = { x: e.clientX, y: e.clientY };
    moved = 0;
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    drag = { x: e.clientX, y: e.clientY };
    rot.vy = -dx * 0.012 * 60;
    rot.vp = -dy * 0.012 * 60;
  });
  const end = () => {
    if (drag && moved < 5) {
      stone = (stone + 1) % STONES.length;
      stage.dataset.stone = STONES[stone].name;
    }
    drag = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', () => (drag = null));

  let time = 0;
  const fit = () => g.fit(1.25, 0.8);
  fit();
  new ResizeObserver(fit).observe(canvas);
  visibleLoop(stage, (dt) => {
    time += dt;
    if (!drag) {
      rot.vy += (0.22 - rot.vy) * Math.min(1, dt * 0.8);
      rot.vp *= Math.pow(0.1, dt);
      rot.pitch += (0.25 + 0.45 * Math.cos(time * 0.18) - rot.pitch) * dt * 0.6;
    }
    rot.yaw += rot.vy * dt;
    rot.pitch = Math.max(-1.45, Math.min(1.45, rot.pitch + rot.vp * dt));
    const cy = Math.cos(rot.yaw), sy = Math.sin(rot.yaw), cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
    // R = Ry(yaw) * Rx(pitch), column-major
    const m = [cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp];
    gl.useProgram(prog.p);
    gl.uniformMatrix3fv(prog.u.uRot.loc, false, m);
    const s = STONES[stone];
    g.run(prog, null, { uFace: faceTex, uRes: [canvas.width, canvas.height], uTime: time, uJade: s.jade, uAbs: s.abs, uDark: 0 });
  });
  return {};
}
