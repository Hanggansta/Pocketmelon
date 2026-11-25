import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reduced, finePointer } from './env.js';

/**
 * v10 motion layer. The GSAP work here is continuous rather than a pile of
 * identical fade-ups: a scroll read-out, a section index, pointer tilt, and
 * velocity that leans on the marquee as the page moves.
 */
export function initMotion({ lenis = null } = {}) {
  const doc = document.documentElement;
  const railItems = new Map();
  document.querySelectorAll('[data-rail]').forEach((el) => railItems.set(el.dataset.rail, el));
  const sections = [...document.querySelectorAll('[data-rail-section]')];
  const progressEl = doc.querySelector('.scroll-progress i');
  let active = null;
  let queued = false;

  const sync = () => {
    queued = false;
    const max = doc.scrollHeight - innerHeight;
    doc.style.setProperty('--sp', max > 0 ? Math.min(1, Math.max(0, scrollY / max)).toFixed(4) : '0');
    if (progressEl && !CSS.supports('animation-timeline: scroll()')) {
      progressEl.style.transform = `scaleX(${doc.style.getPropertyValue('--sp')})`;
    }
    if (!sections.length) return;
    const mid = innerHeight / 2;
    let found = null;
    for (const section of sections) {
      const r = section.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { found = section; break; }
    }
    // in the gaps between sections (the marquee band, for instance) keep the last mark
    if (!found || found === active) return;
    active = found;
    railItems.forEach((li) => li.classList.remove('is-on'));
    railItems.get(found.dataset.railSection)?.classList.add('is-on');
    doc.dataset.section = found.dataset.railSection;
  };

  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  };

  if (lenis) lenis.on('scroll', request);
  else window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  sync();

  if (reduced) return;

  /* pointer tilt on framed product shots */
  if (finePointer) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      let lit = false;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--tx', (x * 2).toFixed(3));
        el.style.setProperty('--ty', (y * 2).toFixed(3));
        if (!lit) { lit = true; el.classList.add('is-tilting'); }
      });
      el.addEventListener('pointerleave', () => {
        lit = false;
        el.style.setProperty('--tx', '0');
        el.style.setProperty('--ty', '0');
        el.classList.remove('is-tilting');
      });
    });
  }

  /* the marquee leans with the scroll */
  if (finePointer && lenis && document.querySelector('.band__row')) {
    const rows = [...document.querySelectorAll('.band__row')];
    const lean = rows.map((row) => gsap.quickTo(row, 'skewX', { duration: 1.1, ease: 'power3' }));
    lenis.on('scroll', ({ velocity }) => {
      const v = gsap.utils.clamp(-2.6, 2.6, velocity * 0.16);
      lean.forEach((set) => set(v));
    });
  }

  /* numbers count once, from zero */
  gsap.utils.toArray('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count) || 0;
    const fmt = (v) => Math.round(v).toLocaleString(document.documentElement.lang.startsWith('en') ? 'en-US' : 'zh-CN');
    const state = { v: 0 };
    el.textContent = fmt(0);
    ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => gsap.to(state, { v: end, duration: 1.6, ease: 'power2.out', onUpdate: () => (el.textContent = fmt(state.v)) }),
    });
  });

  /* section titles: a hairline rule draws under each one as it settles.
     The rule is a pseudo-element so the grid is never disturbed. */
  gsap.utils.toArray('.section-title').forEach((el) => {
    el.style.setProperty('--rule', 0);
    gsap.to(el, {
      '--rule': 1,
      duration: 1.5,
      ease: 'expo.inOut',
      scrollTrigger: { trigger: el, start: 'top 86%', once: true },
    });
  });

  ScrollTrigger.refresh();
}
