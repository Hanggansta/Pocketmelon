import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { pointer, reduced, finePointer, lerp, clamp } from './env.js';

/**
 * Hero headline: chars rise in on intro, then respond to cursor proximity
 * by swelling in weight and softness along Fraunces' variable axes.
 */
export function prepareHero() {
  const words = document.querySelectorAll('.hero__words');
  const split = SplitText.create(words, { type: 'words,chars', charsClass: 'char', wordsClass: 'word' });
  const chars = split.chars;
  if (!reduced) {
    gsap.set(chars, { yPercent: 115, rotate: 8, transformOrigin: '0% 100%' });
    gsap.set('.hero .reveal-up', { y: 24, autoAlpha: 0 });
  }
  return chars;
}

export function introHero(chars) {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.to(chars, { yPercent: 0, rotate: 0, duration: 1.6, stagger: 0.028 }, 0)
    .to('.hero .reveal-up', { y: 0, autoAlpha: 1, duration: 1.2, stagger: 0.06 }, 0.5);
  return tl;
}

export function initProximity(chars) {
  if (reduced || !finePointer) return;
  const hero = document.querySelector('.hero');
  const data = chars.map((el) => ({
    el,
    italic: !!el.closest('em'),
    cx: 0,
    cy: 0,
    w: el.closest('em') ? 300 : 330,
    soft: 50,
  }));

  const measure = () => {
    for (const d of data) {
      const r = d.el.getBoundingClientRect();
      d.cx = r.left + r.width / 2;
      d.cy = r.top + window.scrollY + r.height / 2;
    }
  };
  measure();
  window.addEventListener('resize', measure);
  document.fonts?.ready.then(measure);

  let inView = true;
  new IntersectionObserver(([e]) => (inView = e.isIntersecting)).observe(hero);

  gsap.ticker.add(() => {
    if (!inView) return;
    const radius = window.innerWidth * 0.22;
    const py = pointer.y + window.scrollY;
    for (const d of data) {
      const dist = Math.hypot(pointer.x - d.cx, py - d.cy);
      const k = pointer.active ? clamp(1 - dist / radius, 0, 1) : 0;
      const e = k * k * (3 - 2 * k); // smoothstep
      const base = d.italic ? 300 : 330;
      const tw = base + e * 470;
      const ts = 50 + e * 50;
      if (Math.abs(tw - d.w) < 0.3 && Math.abs(ts - d.soft) < 0.3) continue;
      d.w = lerp(d.w, tw, 0.14);
      d.soft = lerp(d.soft, ts, 0.14);
      d.el.style.fontWeight = d.w.toFixed(1);
      d.el.style.fontVariationSettings = `"opsz" 144, "SOFT" ${d.soft.toFixed(1)}, "WONK" ${d.italic ? 1 : 0}`;
    }
  });
}
