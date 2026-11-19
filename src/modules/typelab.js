import { pointer, reduced, lerp, clamp } from './env.js';

/**
 * Elastic type: every letter reads the cursor and sets its own weight,
 * optical size and softness on the display face's variable axes.
 * The readout shows the axes of the letter nearest the cursor, like a
 * type tool's inspector. Without a cursor the word breathes on its own.
 */
export function initTypeLab(stage) {
  if (!stage) return;
  const word = stage.querySelector('.typelab__word');
  const out = {
    wght: stage.querySelector('[data-ax="wght"]'),
    opsz: stage.querySelector('[data-ax="opsz"]'),
    soft: stage.querySelector('[data-ax="SOFT"]'),
  };
  const text = word.textContent.trim();
  word.setAttribute('aria-label', text);
  word.textContent = '';
  const letters = [...text].map((ch) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.setAttribute('aria-hidden', 'true');
    word.appendChild(s);
    return { el: s, w: 300, o: 144, s: 100, cx: 0, cy: 0 };
  });

  const apply = (l) => {
    l.el.style.fontVariationSettings = `"wght" ${l.w.toFixed(0)}, "opsz" ${l.o.toFixed(0)}, "SOFT" ${l.s.toFixed(0)}, "WONK" 0`;
  };
  if (reduced) {
    letters.forEach(apply);
    return;
  }

  let visible = false;
  let last = '';
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);

  const measure = () => {
    letters.forEach((l) => {
      const r = l.el.getBoundingClientRect();
      l.cx = r.left + r.width / 2;
      l.cy = r.top + r.height / 2;
    });
  };

  const tick = (now) => {
    requestAnimationFrame(tick);
    if (!visible) return;
    measure();
    const box = stage.getBoundingClientRect();
    const inside = pointer.active && pointer.x > box.left && pointer.x < box.right && pointer.y > box.top && pointer.y < box.bottom;
    const R = box.width * 0.34;
    let nearest = null;
    let nd = Infinity;
    letters.forEach((l, i) => {
      let f;
      if (inside) {
        const d = Math.hypot(pointer.x - l.cx, pointer.y - l.cy);
        f = clamp(1 - d / R, 0, 1);
        f = f * f * (3 - 2 * f);
        if (d < nd) { nd = d; nearest = l; }
      } else {
        f = 0.5 + 0.5 * Math.sin(now / 700 - i * 0.7);
        if (i === 0) nearest = l;
      }
      l.w = lerp(l.w, 140 + f * 760, 0.16);
      l.o = lerp(l.o, 144 - f * 120, 0.16);
      l.s = lerp(l.s, 100 - f * 100, 0.16);
      apply(l);
    });
    if (nearest) {
      const v = `${nearest.w | 0}|${nearest.o | 0}|${nearest.s | 0}`;
      if (v !== last) {
        last = v;
        out.wght && (out.wght.textContent = String(nearest.w | 0).padStart(3, '0'));
        out.opsz && (out.opsz.textContent = String(nearest.o | 0).padStart(3, '0'));
        out.soft && (out.soft.textContent = String(nearest.s | 0).padStart(3, '0'));
      }
    }
  };
  requestAnimationFrame(tick);
}
