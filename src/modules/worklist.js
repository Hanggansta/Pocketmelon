import gsap from 'gsap';
import { getGL, makeProgram, makeTexture, bind, fit, NOISE } from './ink/gl.js';
import { reduced, finePointer, pointer } from './env.js';

/**
 * Work list (Lusion-style index): big project rows; on hover a floating preview follows the
 * cursor. Images enter and swap through an ink-bleed mask rather than a fade, and the card
 * leans with the cursor's velocity. Touch screens get inline thumbnails instead (CSS).
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
  vec2 st = uv * uRes / min(uRes.x, uRes.y);
  float n = fbm(st * 2.2 + uTime * 0.05);
  float n2 = fbm3(st * 9.0);

  // velocity smear, like wet ink dragged sideways
  vec2 off = vec2(uVel * 0.04 * (n - 0.5), 0.0);
  vec4 a = texture2D(uA, cover(uv + off, uSizeA));
  vec4 b = texture2D(uB, cover(uv + off * 1.4, uSizeB));

  // swap: B bleeds over A from the bottom-left, ragged
  float m = smoothstep(uMix - 0.12, uMix + 0.02, (1.0 - (uv.x * 0.4 + uv.y * 0.6)) * 0.7 + n * 0.45 - 0.1);
  vec3 col = mix(a.rgb, b.rgb, 1.0 - m);
  if (uMix >= 0.999) col = b.rgb;

  // show / hide through an ink blot from the centre
  float d = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  float blot = d * 1.3 + (n - 0.5) * 0.5 + (n2 - 0.5) * 0.06;
  float front = uShow * 1.35;
  float alpha = smoothstep(front, front - 0.04, blot);
  // a thin darker wet edge while it spreads
  float rim = smoothstep(0.06, 0.0, front - blot) * alpha * (1.0 - smoothstep(0.85, 1.0, uShow));
  col = mix(col, col * 0.55, rim * 0.6);
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
