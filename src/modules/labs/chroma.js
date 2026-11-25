import { GL, HEAD, visibleLoop } from '../gl/gl2.js';

/**
 * 流光 — Chroma.
 *
 * A single fragment shader, no textures, no video: a domain-warped fBm field
 * read as silk. Ink, jade, cinnabar and bone, with a travelling filament of
 * light. The pointer pushes the field aside; a click sends a ring through it.
 *
 * This is a studio study, not a product. It exists to keep the hand in shape.
 */

const FS = HEAD + `
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uTime;
uniform float uAspect;
uniform float uPulse;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime * 0.045;

  // the pointer is a soft oar: it pushes the silk, it does not paint on it
  vec2 m = (uMouse - 0.5) * vec2(uAspect, 1.0);
  float md = length(p - m);
  p += normalize(p - m + 1e-4) * exp(-md * 2.4) * 0.16;

  // the whole sheet breathes and turns, very slowly
  p = rot(0.16 * sin(t * 0.7) + 0.05 * sin(t * 1.9)) * p;

  // domain warp: q bends p, r bends q, f is the cloth
  vec2 q = vec2(
    fbm(p * 2.1 + vec2(0.0, t)),
    fbm(p * 2.1 + vec2(5.2, -t))
  );
  vec2 r = vec2(
    fbm(p * 2.8 + q * 1.8 + vec2(t * 0.8, 0.0)),
    fbm(p * 2.8 + q * 1.8 + vec2(0.0, 4.3 - t))
  );
  float f = fbm(p * 1.6 + r * 1.6);
  float g = fbm(p * 4.6 - r * 2.2 + t * 0.6);

  vec3 ink  = vec3(0.026, 0.029, 0.032);
  vec3 jade = vec3(0.10, 0.29, 0.27);
  vec3 rust = vec3(0.56, 0.18, 0.10);
  vec3 gold = vec3(0.71, 0.55, 0.30);
  vec3 bone = vec3(0.93, 0.90, 0.84);

  vec3 col = ink;
  col = mix(col, jade, smoothstep(0.34, 0.82, q.x));
  col = mix(col, rust, smoothstep(0.54, 0.95, q.y) * 0.62);
  col = mix(col, gold, smoothstep(0.58, 0.95, r.x) * 0.38);

  // moving filaments: the part that reads as thread, not smoke
  float fil = pow(0.5 + 0.5 * sin((f * 3.2 + g * 0.7) * 19.0 + t * 2.1), 10.0);
  col += bone * fil * 0.5;
  col += bone * smoothstep(0.55, 0.96, f) * smoothstep(0.18, 0.9, g) * 0.1;

  // a click sends one ring through the cloth
  if (uPulse < 1.0) {
    float ring = exp(-abs(length(p - m) - uPulse * 0.95) * 24.0) * (1.0 - uPulse);
    col += bone * ring * 0.32;
  }

  // light from above, vignette, a little film grain
  col *= 0.82 + 0.32 * smoothstep(0.0, 1.0, uv.y);
  vec2 v = uv - 0.5;
  col *= 1.0 - 0.55 * dot(v, v);
  col += (hash(uv * uRes + fract(uTime) * 17.0) - 0.5) * 0.028;

  o = vec4(col, 1.0);
}`;

export function initChroma(figure, { reduced = false } = {}) {
  const stage = figure?.querySelector('.chroma__stage');
  const canvas = stage?.querySelector('canvas');
  if (!stage || !canvas) return null;

  let g;
  try {
    g = new GL(canvas);
  } catch {
    figure.classList.add('no-gl');
    return null;
  }
  let prog;
  try {
    prog = g.program(FS);
  } catch (err) {
    console.warn('[chroma]', err);
    figure.classList.add('no-gl');
    g.lose();
    return null;
  }
  figure.classList.add('has-gl');

  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let pulse = 1;
  let aspect = 1;
  const dpr = matchMedia('(max-width: 900px)').matches ? 1.1 : 1.5;

  const draw = (time) => {
    g.fit(dpr);
    const r = canvas.getBoundingClientRect();
    aspect = r.width / Math.max(1, r.height);
    g.run(prog, null, {
      uRes: [canvas.width, canvas.height],
      uMouse: [mouse.x, mouse.y],
      uTime: time,
      uAspect: aspect,
      uPulse: pulse,
    });
  };

  if (reduced) {
    draw(11.3);
    addEventListener('resize', () => draw(11.3), { passive: true });
    return { stop() {} };
  }

  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / Math.max(1, r.width);
    mouse.ty = 1 - (e.clientY - r.top) / Math.max(1, r.height);
  }, { passive: true });
  stage.addEventListener('pointerleave', () => {
    mouse.tx = 0.5;
    mouse.ty = 0.5;
  });
  stage.addEventListener('pointerdown', () => { pulse = 0; });

  const loop = visibleLoop(stage, (dt, time) => {
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3.2);
    mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3.2);
    pulse = Math.min(1, pulse + dt / 1.3);
    draw(time);
  });

  return loop;
}
