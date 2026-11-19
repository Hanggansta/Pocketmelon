import { getGL, makeProgram, fit, NOISE, easeInOut } from './ink/gl.js';
import { reduced } from './env.js';

/**
 * 水墨 page transitions.
 * Leaving: ink drops land where you clicked and spread until they swallow the page, with
 * wet, darker rims and a grey bleed running ahead of the front. The studio seal is pressed
 * in the centre. Arriving: the page starts covered (inline guard in <head>) and the ink
 * opens from the centre like paper drying through.
 */
const KEY = 'pm:transition';
export const INK_BG = '#12110e';

const FRAG = /* glsl */ `
${NOISE}
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uP, uMode, uSeed;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec2 st = vec2(uv.x * asp, uv.y);
  vec2 o = vec2(uOrigin.x * asp, uOrigin.y);

  float n = fbm(st * 2.6 + uSeed);
  float n2 = fbm3(st * 14.0 - uSeed);
  // three drops that merge: the click, and two satellites
  vec2 o2 = o + vec2(0.22, -0.16) * vec2(sin(uSeed), cos(uSeed * 1.7));
  vec2 o3 = o + vec2(-0.25, 0.2) * vec2(cos(uSeed * 0.7), sin(uSeed * 2.1));
  float d = min(length(st - o), min(length(st - o2) + 0.14, length(st - o3) + 0.22));
  float field = d + (n - 0.5) * 0.42 + (n2 - 0.5) * 0.05;

  float far = length(vec2(asp, 1.0)) + 0.5;
  float front = uP * far;

  float inside = smoothstep(front + 0.004, front - 0.004, field);
  float rim = smoothstep(0.1, 0.0, front - field) * inside;         // wet edge, denser ink
  float bleed = smoothstep(front + 0.07, front, field) * (1.0 - inside); // grey running ahead

  // revealing = the inverse: a hole that grows from the centre
  if (uMode > 0.5) {
    inside = 1.0 - inside;
    rim = smoothstep(0.1, 0.0, front - field) * inside * step(0.001, uP);
    bleed = 0.0;
  }

  vec3 ink = vec3(0.071, 0.067, 0.055);
  float shade = 0.05 * (fbm3(st * 5.0 + 9.0) - 0.5);
  vec3 col = ink + shade - rim * 0.03;
  float a = clamp(inside + bleed * 0.35 * (0.6 + n2), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

export function initTransitions() {
  const wrap = document.createElement('div');
  wrap.className = 'ink-transition';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = '<canvas></canvas><svg class="ink-transition__seal seal" viewBox="0 0 100 100"><use href="#seal"></use></svg>';
  document.body.appendChild(wrap);
  const canvas = wrap.querySelector('canvas');
  const seal = wrap.querySelector('.ink-transition__seal');
  const gl = getGL(canvas);
  let prog = null;
  try {
    if (gl) prog = makeProgram(gl, FRAG);
  } catch (e) {
    console.warn('[ink transition]', e);
  }
  const seed = Math.random() * 20;

  const draw = (p, mode, origin = [0.5, 0.5]) => {
    if (!prog) {
      // no WebGL: a plain fade
      wrap.style.background = INK_BG;
      wrap.style.opacity = mode ? 1 - p : p;
      return;
    }
    fit(canvas, 1, 1600);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    prog.use()
      .f('uRes', canvas.width, canvas.height)
      .f('uOrigin', origin[0], origin[1])
      .f('uP', p)
      .f('uMode', mode)
      .f('uSeed', seed)
      .draw();
  };

  const run = (mode, duration, origin) =>
    new Promise((resolve) => {
      wrap.style.visibility = 'visible';
      const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        draw(easeInOut(t), mode, origin);
        if (t < 1) requestAnimationFrame(frame);
        else {
          if (mode === 1) wrap.style.visibility = 'hidden';
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });

  const arriving = sessionStorage.getItem(KEY) === '1';
  sessionStorage.removeItem(KEY);

  /** uncover the page (after arrival or the loader) */
  const reveal = () => {
    document.documentElement.classList.remove('is-arriving');
    if (reduced) {
      wrap.style.visibility = 'hidden';
      return Promise.resolve();
    }
    wrap.style.visibility = 'visible';
    draw(0, 1);
    seal.classList.remove('is-on');
    return run(1, 1100, [0.5, 0.52]);
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.dataset.noTransition !== undefined) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.protocol === 'mailto:') return;
    if (url.pathname === location.pathname && url.hash) return; // in-page anchor
    e.preventDefault();
    sessionStorage.setItem(KEY, '1');
    if (reduced) {
      location.href = url.href;
      return;
    }
    const origin = [e.clientX / innerWidth || 0.5, 1 - (e.clientY / innerHeight || 0.5)];
    run(0, 950, origin).then(() => {
      seal.classList.add('is-on');
      setTimeout(() => (location.href = url.href), 380);
    });
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      wrap.style.visibility = 'hidden';
      seal.classList.remove('is-on');
      document.documentElement.classList.remove('is-arriving');
    }
  });

  return { arriving, reveal };
}
