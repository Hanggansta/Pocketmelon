import gsap from 'gsap';
import { finePointer, reduced } from './env.js';

/** Elastic magnetic pull for CTAs */
export function initMagnetic() {
  if (!finePointer || reduced) return;
  document.querySelectorAll('.magnetic').forEach((el) => {
    const strength = el.classList.contains('cta') ? 0.4 : 0.3;
    const inner = el.querySelector('.cta__label, .pill__text');
    const xTo = gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.8, ease: 'power3' });
    const ixTo = inner && gsap.quickTo(inner, 'x', { duration: 0.8, ease: 'power3' });
    const iyTo = inner && gsap.quickTo(inner, 'y', { duration: 0.8, ease: 'power3' });

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      xTo(x * strength);
      yTo(y * strength);
      if (inner) {
        ixTo(x * strength * 0.35);
        iyTo(y * strength * 0.35);
      }
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.35)' });
      if (inner) gsap.to(inner, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.35)' });
    });
  });
}

/** Live clocks for each studio */
export function initClocks() {
  const els = document.querySelectorAll('[data-clock]');
  const fmts = new Map();
  const tick = () => {
    const now = new Date();
    els.forEach((el) => {
      const tz = el.dataset.clock;
      if (!fmts.has(tz)) {
        fmts.set(tz, new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      }
      el.textContent = fmts.get(tz).format(now);
    });
  };
  tick();
  setInterval(tick, 1000);
}

/** Copy-to-clipboard with in-place confirmation */
export function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    let timer;
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const ta = Object.assign(document.createElement('textarea'), { value });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      btn.classList.add('is-copied');
      clearTimeout(timer);
      timer = setTimeout(() => btn.classList.remove('is-copied'), 1800);
    });
  });
}
