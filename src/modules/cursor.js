import gsap from 'gsap';

/**
 * The cursor is the studio mark at work: four corner brackets — a 口, a frame, a viewfinder.
 *
 *   idle      a small reticle with a 2 px pip, brackets trailing on a spring
 *   link      the brackets let go of the pointer and lock onto the element's box (target lock)
 *   label     over a stage or a case, the frame opens and a mono caption decodes beside it,
 *             with live coordinates — the screen as a measured, designed space
 *   press     the frame snaps in by a few pixels
 *
 * Everything is drawn in white with `mix-blend-mode: difference`, so it reads on paper, on black
 * and on imagery without theme switching. No circles.
 */
const GLYPHS = '01<>/_#[]+=*:';
const PAD = 7; // breathing room when locked onto an element

export function initCursor() {
  const root = document.querySelector('.cursor');
  if (!root) return;
  const box = root.querySelector('.cursor__box');
  const pip = root.querySelector('.cursor__pip');
  const tag = root.querySelector('.cursor__tag');
  const label = root.querySelector('.cursor__label');
  const coords = root.querySelector('.cursor__xy');
  document.documentElement.classList.add('has-cursor');

  const ptr = { x: innerWidth / 2, y: innerHeight / 2 };
  const cur = { x: ptr.x, y: ptr.y, w: 22, h: 22 };
  const vel = { x: 0, y: 0, w: 0, h: 0 };
  let lock = null; // element the frame is locked onto
  let mode = 'idle'; // idle | link | label | hidden
  let press = 0;
  let seen = false;

  window.addEventListener(
    'pointermove',
    (e) => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      if (!seen) {
        seen = true;
        Object.assign(cur, { x: ptr.x, y: ptr.y });
        gsap.to(root, { opacity: 1, duration: 0.4 });
      }
    },
    { passive: true }
  );

  // critically-damped-ish spring per channel: the frame follows with a little weight
  const spring = (k, d, dt) => (key, target) => {
    const a = (target - cur[key]) * k - vel[key] * d;
    vel[key] += a * dt;
    cur[key] += vel[key] * dt;
  };

  gsap.ticker.add((_, dtMs) => {
    const dt = Math.min(dtMs, 40) / 1000;
    let tx = ptr.x, ty = ptr.y, tw = 22, th = 22;
    if (mode === 'link' && lock?.isConnected) {
      const r = lock.getBoundingClientRect();
      tx = r.left + r.width / 2; ty = r.top + r.height / 2;
      tw = r.width + PAD * 2; th = r.height + PAD * 2;
      // a little pull towards the pointer so the lock feels alive
      tx += (ptr.x - tx) * 0.08; ty += (ptr.y - ty) * 0.08;
    } else if (mode === 'label') {
      tw = 46; th = 46;
    }
    tw -= press * 6; th -= press * 6;
    const s = mode === 'link' ? spring(260, 26, dt) : spring(520, 38, dt);
    s('x', tx); s('y', ty); s('w', tw); s('h', th);
    box.style.transform = `translate3d(${cur.x - cur.w / 2}px, ${cur.y - cur.h / 2}px, 0)`;
    box.style.width = `${cur.w}px`;
    box.style.height = `${cur.h}px`;
    pip.style.transform = `translate3d(${ptr.x}px, ${ptr.y}px, 0)`;
    tag.style.transform = `translate3d(${cur.x + cur.w / 2 + 10}px, ${cur.y - cur.h / 2}px, 0)`;
    if (mode === 'label') coords.textContent = `${String(Math.round(ptr.x)).padStart(4, '0')} · ${String(Math.round(ptr.y)).padStart(4, '0')}`;
  });

  // caption decodes from glyph noise into the word
  let scramble = null;
  const write = (text) => {
    scramble?.kill();
    const o = { p: 0 };
    scramble = gsap.to(o, {
      p: 1,
      duration: Math.min(0.6, 0.18 + text.length * 0.04),
      ease: 'none',
      onUpdate: () => {
        const n = Math.floor(o.p * text.length);
        let s = text.slice(0, n);
        for (let i = n; i < text.length; i++) s += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        label.textContent = s;
      },
      onComplete: () => (label.textContent = text),
    });
  };

  const set = (m, el = null, text = '') => {
    if (m === mode && el === lock && (m !== 'label' || label.dataset.text === text)) return;
    mode = m;
    lock = el;
    root.dataset.mode = m;
    if (m === 'label') {
      label.dataset.text = text;
      write(text);
    }
  };

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-cursor], a, button, label, [role="radio"]');
    if (!el) return set('idle');
    const c = el.getAttribute('data-cursor');
    if (c === 'hide') return set('hidden');
    if (c) return set('label', el, c);
    set('link', el);
  });

  document.addEventListener('pointerdown', () => gsap.to({ v: press }, { v: 1, duration: 0.12, onUpdate() { press = this.targets()[0].v; } }));
  document.addEventListener('pointerup', () => gsap.to({ v: press }, { v: 0, duration: 0.5, ease: 'elastic.out(1, 0.45)', onUpdate() { press = this.targets()[0].v; } }));
  document.documentElement.addEventListener('pointerleave', () => gsap.to(root, { opacity: 0, duration: 0.3 }));
  document.documentElement.addEventListener('pointerenter', () => seen && gsap.to(root, { opacity: 1, duration: 0.3 }));
  set('idle');
}
