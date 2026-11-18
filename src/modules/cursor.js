import gsap from 'gsap';
import { clamp } from './env.js';

/**
 * Two-part cursor: a blend-mode dot that tracks 1:1 and a melon "bubble"
 * that trails behind, stretches with velocity and carries contextual labels.
 */
export function initCursor() {
  const root = document.querySelector('.cursor');
  const dot = root.querySelector('.cursor__dot');
  const ring = root.querySelector('.cursor__ring');
  const label = root.querySelector('.cursor__label');
  document.documentElement.classList.add('has-cursor');

  gsap.set(ring, { scale: 0 });
  gsap.set([dot, ring], { x: -100, y: -100 });

  const dotX = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
  const ringPos = { x: -100, y: -100 };
  const target = { x: -100, y: -100 };
  let ringOn = false;

  window.addEventListener(
    'pointermove',
    (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      dotX(e.clientX);
      dotY(e.clientY);
    },
    { passive: true }
  );

  // trailing bubble with velocity squash & stretch
  gsap.ticker.add(() => {
    const dx = target.x - ringPos.x;
    const dy = target.y - ringPos.y;
    ringPos.x += dx * 0.16;
    ringPos.y += dy * 0.16;
    const v = clamp(Math.hypot(dx, dy) / 600, 0, 0.35);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    gsap.set(ring, {
      x: ringPos.x,
      y: ringPos.y,
      rotation: angle,
      scaleX: ringOn ? 1 + v : 0,
      scaleY: ringOn ? 1 - v * 0.6 : 0,
    });
    // keep label upright despite ring rotation
    gsap.set(label, { rotation: -angle });
  });

  const show = (text) => {
    label.textContent = text;
    ringOn = true;
    root.classList.add('is-hidden');
  };
  const hide = () => {
    ringOn = false;
    root.classList.remove('is-hidden');
  };

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-cursor], a, button');
    root.classList.remove('is-hover');
    if (!el) return hide();
    const c = el.getAttribute('data-cursor');
    if (c === 'hide') {
      hide();
      root.classList.add('is-hidden');
    } else if (c) {
      show(c);
    } else {
      hide();
      root.classList.add('is-hover');
    }
  });

  document.addEventListener('pointerdown', () => gsap.to(dot, { scale: 0.6, duration: 0.2 }));
  document.addEventListener('pointerup', () => gsap.to(dot, { scale: 1, duration: 0.4, ease: 'elastic.out(1,0.4)' }));
  document.documentElement.addEventListener('pointerleave', () => gsap.to(root, { opacity: 0, duration: 0.3 }));
  document.documentElement.addEventListener('pointerenter', () => gsap.to(root, { opacity: 1, duration: 0.3 }));
}
