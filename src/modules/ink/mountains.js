import { getGL, makeProgram, fit, NOISE } from './gl.js';
import { reduced } from '../env.js';
import { pointer } from '../env.js';

/**
 * 远山: layered ink-wash mountains in the manner of Song-dynasty landscapes.
 * Far ridges are pale and blue-grey, near ones dense; every layer dissolves into mist
 * below its ridge (留白, the empty paper, does half the work). A small cinnabar sun sits
 * behind the second range. The ranges drift almost imperceptibly and lean with the cursor.
 */
const FRAG = /* glsl */ `
${NOISE}
uniform vec2 uRes;
uniform float uTime, uSeed;
uniform vec2 uMouse;
uniform vec3 uSun;
varying vec2 vUv;

float ridge(float x, float seed) {
  float h = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = noise(vec2(x * f + seed, seed * 1.3));
    n = 1.0 - abs(n * 2.0 - 1.0);   // sharpen into peaks
    h += a * n * n;
    f *= 2.07; a *= 0.48;
  }
  return h;
}

void main() {
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec2 st = vec2(uv.x * asp, uv.y);
  vec3 col = vec3(0.0);
  float A = 0.0;

  // cinnabar sun, soft-edged, behind everything
  vec2 sp = vec2(0.6 * asp, 0.72);
  float sd = length(st - sp);
  float sun = smoothstep(0.064, 0.057, sd) * 0.74 * (0.9 + 0.1 * fbm(st * 26.0));
  col = uSun * sun; A = sun;

  for (int i = 0; i < 5; i++) {
    float k = float(i) / 4.0;                 // 0 far → 1 near
    float sx = st.x * mix(1.1, 2.4, k) + uSeed * (1.0 + k * 3.0) + uTime * mix(0.002, 0.009, k) + uMouse.x * mix(0.01, 0.06, k);
    float base = mix(0.6, 0.1, k) + uMouse.y * 0.01 * k;
    float h = base + ridge(sx, uSeed + k * 7.0) * mix(0.18, 0.32, k);
    float below = h - uv.y;
    if (below < -0.01) continue;

    // 皴: vertical texture strokes, darker just under the ridge
    float tex = fbm(vec2(sx * 7.0, uv.y * 14.0 + k * 5.0));
    float edge = smoothstep(0.0025, -0.0015, -below);           // inside the silhouette, anti-aliased
    float mist = smoothstep(0.0, mix(0.07, 0.2, k), below + (tex - 0.5) * 0.05);
    float tone = mix(0.14, 0.74, k * k * 0.6 + k * 0.4);
    float a = edge * tone * (1.0 - mist * mix(0.94, 0.84, k)) * (0.88 + 0.24 * tex);
    // a fine contour along the ridge, drawn with the tip of a brush that runs dry in places
    float dryLine = smoothstep(0.35, 0.65, noise(vec2(sx * 3.0, k * 11.0 + uSeed)));
    a += edge * smoothstep(0.006, 0.0, below) * tone * 0.18 * dryLine;
    // drifting cloud band (云气) that cuts across the middle ranges
    float cloud = smoothstep(0.42, 0.75, fbm(vec2(st.x * 1.6 - uTime * 0.004, uv.y * 5.0 + k * 3.0)));
    a *= 1.0 - cloud * smoothstep(0.0, 0.12, below) * (1.0 - k) * 0.9;
    // near ranges dissolve into the bottom mist
    a *= smoothstep(0.0, 0.26, uv.y + k * 0.02);
    a = clamp(a, 0.0, 1.0);

    vec3 ink = mix(vec3(0.58, 0.6, 0.6), vec3(0.11, 0.11, 0.1), k);
    col = ink * a + col * (1.0 - a);
    A = a + A * (1.0 - a);
  }
  gl_FragColor = vec4(col, A);
}`;

export class InkMountains {
  constructor(el, { seed = 3.7 } = {}) {
    this.el = el;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ink-mountains__gl';
    this.canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(this.canvas);
    const gl = (this.gl = getGL(this.canvas));
    if (!gl) return;
    try {
      this.prog = makeProgram(gl, FRAG);
    } catch (e) {
      console.warn('[ink mountains]', e);
      return;
    }
    this.seed = seed;
    this.mouse = { x: 0, y: 0 };
    this.visible = false;
    this.t0 = performance.now();
    this.last = 0;
    new ResizeObserver(() => { fit(this.canvas, 1.5, 2200); this.render(); }).observe(el);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible && !reduced) this.loop();
    }).observe(el);
    fit(this.canvas, 1.5, 2200);
    this.render();
  }

  loop = (now = performance.now()) => {
    if (!this.visible) return;
    requestAnimationFrame(this.loop);
    if (now - this.last < 33) return; // 30 fps is plenty for drifting mountains
    this.last = now;
    const r = this.el.getBoundingClientRect();
    const tx = pointer.active ? (pointer.x / innerWidth - 0.5) : 0;
    const ty = pointer.active ? ((pointer.y - r.top) / r.height - 0.5) : 0;
    this.mouse.x += (tx - this.mouse.x) * 0.04;
    this.mouse.y += (ty - this.mouse.y) * 0.04;
    this.render(now);
  };

  render(now = performance.now()) {
    if (!this.prog) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.prog.use()
      .f('uRes', this.canvas.width, this.canvas.height)
      .f('uTime', reduced ? 0 : (now - this.t0) / 1000)
      .f('uSeed', this.seed)
      .f('uMouse', this.mouse.x, -this.mouse.y)
      .f('uSun', 0.72, 0.22, 0.17)
      .draw();
  }
}
