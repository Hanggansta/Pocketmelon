import { InkPaper, inkSupported } from './ink/fluid.js';
import { reduced, finePointer } from './env.js';
import { cjkCSS } from './fonts.js';

const supported = inkSupported();
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 2.2);

/** run a scripted stroke to completion without animating (reduced motion / instant states) */
function bake(ink, frames = 150) {
  let now = performance.now();
  ink.stop();
  for (let i = 0; i < frames; i++) ink.step(1 / 60, (now += 1000 / 60));
}

/* ---------------------------------------------------------
   Hero: a sheet of xuan paper. Move to paint, rest to re-ink,
   click to drop ink. Opens with one ensō.
   --------------------------------------------------------- */
export function initHeroInk(frame) {
  const canvas = frame?.querySelector('.hero__ink');
  if (!canvas || !supported) {
    frame?.closest('.hero')?.classList.add('no-ink');
    return null;
  }
  try {
    const ink = new InkPaper({ canvas, host: frame, mode: 'hover', preset: 'hero', paper: '#ebe4d5', ink: '#12100d', wash: '#5a5349' });
    frame.closest('.hero').classList.add('has-ink');
    if (import.meta.env.DEV) window.__ink = ink;
    return ink;
  } catch (err) {
    console.warn('[ink] hero paper unavailable', err);
    frame.closest('.hero').classList.add('no-ink');
    return null;
  }
}

/** one breath, one circle: thick at the press, breaking into flying white at the tail */
export function enso(ink) {
  if (!ink) return Promise.resolve();
  const wide = ink.aspect > 1.1;
  const cx = wide ? 0.7 : 0.5, cy = wide ? 0.56 : 0.62, R = wide ? 0.27 : 0.2 * ink.aspect + 0.02;
  const a0 = 2.15 + Math.random() * 0.2;
  const path = (t) => {
    const a = a0 - t * Math.PI * 1.86;
    const r = R * (1 + 0.035 * Math.sin(t * 7.0 + 1.0) - 0.02 * t);
    return [cx + (r * Math.cos(a)) / ink.aspect, cy + r * Math.sin(a)];
  };
  const p = ink.stroke(path, { duration: 1.9, ease: easeInOut, radius: wide ? 2.5 : 2, tone: { pig: 1.8, water: 0.42 }, dryEnd: 0.6 });
  if (reduced) bake(ink, 170);
  return p;
}

/* ---------------------------------------------------------
   品, alum resist: the paper is sized with alum everywhere
   except the character. A wash only takes where the paper
   still drinks, so 品 surfaces under the visitor's hand.
   --------------------------------------------------------- */
export function initAlum(fig) {
  const canvas = fig?.querySelector('.pin__ink');
  if (!canvas || !supported) {
    fig?.classList.add('no-ink');
    return null;
  }
  const family = '"KingHwa_OldSong", "Noto Serif SC Variable", "Songti SC", serif';
  const mask = (w, h) => {
    const m = document.createElement('canvas');
    m.width = w; m.height = h;
    const x = m.getContext('2d');
    const size = Math.min(w, h) * 0.8;
    x.font = `${size}px ${family}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#000';
    x.fillText('品', w / 2, h * 0.53);
    return m;
  };
  let ink;
  try {
    ink = new InkPaper({ canvas, host: fig, mode: 'hover', preset: 'reveal', mask, paper: '#efe8da', ink: '#14110d', wash: '#625a4f' });
  } catch (err) {
    console.warn('[ink] alum paper unavailable', err);
    fig.classList.add('no-ink');
    return null;
  }
  fig.classList.add('has-ink');
  // the mask needs the display face: rebuild the sizing once it has arrived
  cjkCSS.then(() => document.fonts.load(`100px KingHwa_OldSong`, '品')).then(() => ink.refreshPaper(), () => {});

  let washed = false;
  const autoWash = () => {
    if (washed) return;
    washed = true;
    fig.classList.add('is-washed');
    // a broad zig-zag wash, the way you'd lay ink with a hake brush
    const rows = 4;
    const path = (t) => {
      const k = t * rows;
      const row = Math.min(rows - 1, Math.floor(k));
      const f = k - row;
      const x = row % 2 ? 0.88 - f * 0.76 : 0.12 + f * 0.76;
      return [x, 0.82 - (row + f * 0.9) * (0.64 / rows)];
    };
    ink.stroke(path, { duration: 4.2, ease: easeOut, radius: 0.85, tone: { pig: 0.85, water: 0.8 }, dryEnd: 0.15 });
    if (reduced) bake(ink, 420);
  };
  fig.addEventListener('pointermove', () => fig.classList.add('is-washed'), { once: true, passive: true });
  // touch screens and reduced motion get the wash laid for them
  if (!finePointer || reduced) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setTimeout(autoWash, 300);
    }, { threshold: 0.55 });
    io.observe(fig);
  }
  return ink;
}

/* ---------------------------------------------------------
   一笔墨: drag to write, five tones of ink, a new sheet.
   --------------------------------------------------------- */
export function initInkLab(stage) {
  const canvas = stage?.querySelector('.inklab__canvas');
  if (!canvas || !supported) {
    stage?.classList.add('no-ink');
    return null;
  }
  let ink;
  try {
    ink = new InkPaper({ canvas, host: stage, mode: 'drag', preset: 'lab', paper: '#f0e9dc', ink: '#110f0c', wash: '#5c554b' });
  } catch (err) {
    console.warn('[ink] lab paper unavailable', err);
    stage.classList.add('no-ink');
    return null;
  }
  stage.classList.add('has-ink');
  const bar = stage.querySelector('.inklab__bar');
  bar?.addEventListener('pointerdown', (e) => e.stopPropagation());
  const tones = [...stage.querySelectorAll('[data-tone]')];
  tones.forEach((b) =>
    b.addEventListener('click', () => {
      ink.setTone(b.dataset.tone);
      tones.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }),
  );
  stage.querySelector('[data-ink-clear]')?.addEventListener('click', () => ink.clear());
  stage.addEventListener('pointerdown', () => stage.classList.add('is-used'), { once: true });

  // one horizontal stroke (一) the first time it comes into view, so the medium explains itself
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    setTimeout(() => {
      const path = (t) => [0.2 + t * 0.6, 0.56 + 0.035 * Math.sin(t * Math.PI) - 0.02 * t];
      ink.stroke(path, { duration: 1.1, ease: easeInOut, radius: 1.5, tone: { pig: 1.9, water: 0.4 }, dryEnd: 0.55 });
      if (reduced) bake(ink, 120);
    }, 400);
  }, { threshold: 0.6 });
  io.observe(stage);
  return ink;
}
