import gsap from 'gsap';
import { getGL, makeProgram, makeTexture, bind, fit, NOISE } from './ink/gl.js';
import { reduced, finePointer, pointer } from './env.js';

/**
 * Work list (Lusion-style index): big project rows; on hover a floating preview follows the
 * cursor. Images open through a rectangular aperture and swap with a banded scan wipe; the
 * card bends and splits its colour channels with the cursor's velocity. Touch screens get inline thumbnails instead (CSS).
 */
const FRAG = /* glsl */ `
${NOISE}
uniform sampler2D uA, uB;
uniform vec2 uRes, uSizeA, uSizeB;
uniform float uMix, uShow, uTime, uVel;
varying vec2 vUv;

vec2 cover(vec2 uv, vec2 img) {
  float ra = uRes.x / uRes.y, ri = img.x / img.y;
  vec2 s = ra > ri ? vec2(1.0, ri / ra) : vec2(ra / ri, 1.0);
  return (uv - 0.5) * s + 0.5;
}

void main() {
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  float v = clamp(uVel, -1.5, 1.5);

  // velocity: the quad bends like film pulled sideways (codrops-style sin bend), channels split
  uv.x -= sin(uv.y * 3.14159) * v * 0.06;
  float split = v * 0.02;
  vec2 ofs = vec2(split, 0.0);
  vec2 ca = cover(uv, uSizeA), cb = cover(uv, uSizeB);
  vec3 a = vec3(texture2D(uA, ca + ofs).r, texture2D(uA, ca).g, texture2D(uA, ca - ofs).b);
  vec3 b = vec3(texture2D(uB, cb + ofs).r, texture2D(uB, cb).g, texture2D(uB, cb - ofs).b);

  // swap: a scan wipe sweeps up through horizontal bands, each band offset a little
  float band = floor(vUv.y * 14.0);
  float jitter = fract(sin(band * 91.7) * 4375.85) * 0.18;
  float m = step(vUv.x * 0.25 + jitter + 0.0, uMix * 1.45 - 0.02);
  vec3 col = mix(a, b, m);
  if (uMix >= 0.999) col = b;
  // a hairline at the wipe front
  float front = abs(vUv.x * 0.25 + jitter - (uMix * 1.45 - 0.02));
  col += vec3(0.85) * smoothstep(0.006, 0.0, front) * step(0.001, uMix) * step(uMix, 0.999);

  // show / hide: a rectangular aperture opens from the centre, slightly faster vertically
  vec2 q = abs(vUv - 0.5) * 2.0;
  float k = uShow;
  float alpha = step(q.x, k * 1.02) * step(q.y, min(1.0, k * 1.25));
  // fine scanlines while moving fast
  col *= 1.0 - abs(v) * 0.08 * step(0.5, fract(gl_FragCoord.y * 0.5));
  gl_FragColor = vec4(col * alpha, alpha);
}`;

export function initWorkList(list) {
  if (!list) return;
  const items = [...list.querySelectorAll('[data-preview]')];
  if (!items.length || !finePointer || reduced) return;

  const box = document.createElement('div');
  box.className = 'wl-preview';
  box.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  box.appendChild(canvas);
  document.body.appendChild(box);
  const gl = getGL(canvas);
  if (!gl) return box.remove();
  let prog;
  try {
    prog = makeProgram(gl, FRAG);
  } catch (e) {
    console.warn('[worklist]', e);
    return box.remove();
  }

  const tex = items.map((el) => {
    const t = { tex: makeTexture(gl), w: 1, h: 1, ready: false };
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      t.w = img.naturalWidth;
      t.h = img.naturalHeight;
      t.ready = true;
    };
    img.src = el.dataset.preview;
    return t;
  });

  const s = { show: 0, mix: 1, a: 0, b: 0, x: innerWidth / 2, y: innerHeight / 2, vx: 0, rot: 0, active: false };
  let raf = 0;
  const start = performance.now();

  const render = () => {
    fit(canvas, 1.5, 1200);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const A = tex[s.a], B = tex[s.b];
    bind(gl, 0, A.tex);
    bind(gl, 1, B.tex);
    prog.use()
      .i('uA', 0).i('uB', 1)
      .f('uRes', canvas.width, canvas.height)
      .f('uSizeA', A.w, A.h).f('uSizeB', B.w, B.h)
      .f('uMix', s.mix).f('uShow', s.show)
      .f('uTime', (performance.now() - start) / 1000)
      .f('uVel', s.vx)
      .draw();
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const tx = pointer.x, ty = pointer.y;
    const dx = tx - s.x;
    s.x += dx * 0.14;
    s.y += (ty - s.y) * 0.14;
    s.vx += (gsap.utils.clamp(-1, 1, dx / 180) - s.vx) * 0.12;
    s.rot += (s.vx * 6 - s.rot) * 0.1;
    box.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%) rotate(${s.rot}deg)`;
    render();
    if (!s.active && s.show <= 0.001) {
      cancelAnimationFrame(raf);
      raf = 0;
      box.style.visibility = 'hidden';
    }
  };

  const enter = (i) => {
    if (!tex[i].ready) return;
    if (!raf) {
      s.x = pointer.x;
      s.y = pointer.y;
      box.style.visibility = 'visible';
      raf = requestAnimationFrame(tick);
    }
    if (s.show < 0.05) {
      s.a = s.b = i;
      s.mix = 1;
    } else if (i !== s.b) {
      s.a = s.b;
      s.b = i;
      s.mix = 0;
      gsap.to(s, { mix: 1, duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
    }
    s.active = true;
    gsap.to(s, { show: 1, duration: 1.0, ease: 'power2.out', overwrite: 'auto' });
  };
  const leave = () => {
    s.active = false;
    gsap.to(s, { show: 0, duration: 0.6, ease: 'power2.in', overwrite: 'auto' });
  };

  items.forEach((el, i) => {
    el.addEventListener('pointerenter', () => enter(i));
    el.addEventListener('focus', () => enter(i));
  });
  list.addEventListener('pointerleave', leave);
  list.addEventListener('focusout', leave);
}
