/* ---------------------------------------------------------
   Showcase: the two cases that follow the hero film.
   Each chapter pins; scroll opens the 口 window into the stage and then scrubs the
   product's own engine (photo → pattern → beads; raw text → graded reading).
   The HUD prints what the engine is actually doing.
   --------------------------------------------------------- */
import { gsap, ScrollTrigger, SplitText, reduced } from '../../core.js';
import { isZh, splitCJK } from '../i18n.js';
import { initBeadStage } from './beadstage.js';
import { initReadStage } from './readstage.js';

const nf = (n) => n.toLocaleString(isZh ? 'zh-CN' : 'en-US');

export function initShowcase(root) {
  if (!root) return null;
  const chapters = [];

  /* 01 · beads */
  const bc = root.querySelector('[data-sc="beads"]');
  if (bc) {
    const hud = (k) => bc.querySelector(`[data-hud="${k}"]`);
    const bar = bc.querySelector('.sc__bar');
    const api = initBeadStage(bc.querySelector('[data-stage="beads"]'), {
      onStats: ({ cols, rows, beads, colors, palette }) => {
        hud('grid').textContent = `${cols} × ${rows} · ${nf(beads)} ${isZh ? '颗' : 'beads'}`;
        hud('colors').textContent = `${colors} / ${palette} ${isZh ? '色' : 'colours'} · OKLab`;
      },
    });
    const steps = isZh ? ['照片', '图纸', '拼豆'] : ['PHOTO', 'PATTERN', 'BEADS'];
    let last = -1;
    chapters.push({
      el: bc,
      set(p) {
        // hold the photo for a beat, then quantise, then fuse
        const s = gsap.utils.clamp(0, 2, gsap.utils.mapRange(0.3, 0.88, 0, 2, p));
        if (api) api.stage = s;
        const i = s < 0.6 ? 0 : s < 1.5 ? 1 : 2;
        if (i !== last) { hud('step').textContent = steps[i]; last = i; }
        bar.style.setProperty('--p', (s / 2).toFixed(3));
      },
      lens: (v) => api && (api.lens = v),
      end: () => api && (api.stage = 2),
    });
  }

  /* 02 · whisperleaf */
  const rc = root.querySelector('[data-sc="whisperleaf"]');
  if (rc) {
    const host = rc.querySelector('[data-stage="read"]');
    const hud = (k) => rc.querySelector(`[data-hud="${k}"]`);
    const bar = rc.querySelector('.sc__bar');
    let graded = 0, lastP = 0;
    const api = initReadStage(host, {
      card: host.querySelector('.read-card'),
      onStats: (s) => {
        graded = s.graded;
        hud('words').textContent = isZh ? `${s.words} 词 · ${s.lemmas} 词元` : `${s.words} WORDS · ${s.lemmas} LEMMAS`;
        chapters.find((c) => c.el === rc)?.set(lastP);
      },
    });
    chapters.push({
      el: rc,
      set(p) {
        lastP = p;
        const s = gsap.utils.clamp(0, 1, gsap.utils.mapRange(0.28, 0.82, 0, 1, p));
        if (api) api.scan = s;
        const pct = Math.round(s * 100);
        hud('scan').textContent = isZh ? `分级 ${pct}% · ${Math.round(graded * s)} 词` : `GRADING ${pct}% · ${Math.round(graded * s)}`;
        bar.style.setProperty('--p', s.toFixed(3));
      },
      lens: (v) => api && (api.lens = v),
      end: () => api && (api.scan = 1),
    });
  }

  chapters.forEach((c) => c.set(0));

  function scroll() {
    const mm = gsap.matchMedia();
    mm.add({ desktop: '(min-width: 901px)', mobile: '(max-width: 900px)' }, (ctx) => {
      chapters.forEach((c) => {
        const pin = c.el.querySelector('.sc__pin');
        const title = c.el.querySelector('[data-sc-title]');
        const parts = isZh ? splitCJK(title) : SplitText.create(title, { type: 'chars', charsClass: 'char' }).chars;
        const rest = c.el.querySelectorAll('.sc__idx, .sc__lede, .sc__meta > div, .sc__cta');
        if (ctx.conditions.desktop) {
          // scroll scrubs: window opens (0 → .3), engine runs (.3 → .88)
          ScrollTrigger.create({
            trigger: c.el,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
            onUpdate: (self) => {
              const p = self.progress;
              const open = gsap.utils.clamp(0, 1, p / 0.28);
              pin.style.setProperty('--in', (1 - gsap.parseEase('power3.inOut')(open)).toFixed(4));
              c.set(p);
            },
          });
          // lens drops in once the stage is open
          ScrollTrigger.create({ trigger: c.el, start: '22% top', end: 'bottom top', onToggle: (s) => c.lens(s.isActive ? 1 : 0) });
          const tl = gsap.timeline({ scrollTrigger: { trigger: c.el, start: '8% top', toggleActions: 'play none none reverse' } });
          tl.from(parts, { yPercent: 110, rotate: 4, autoAlpha: 0, duration: 1.1, stagger: 0.035, ease: 'expo.out' })
            .from(rest, { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.06, ease: 'power3.out' }, 0.2);
        } else {
          // no pin on small screens: the engine runs as the stage crosses the viewport
          const st = c.el.querySelector('.sc__stage');
          ScrollTrigger.create({
            trigger: st, start: 'top 85%', end: 'bottom 25%', scrub: true,
            onUpdate: (self) => c.set(0.3 + self.progress * 0.6),
            onToggle: (s) => c.lens(s.isActive ? 1 : 0),
          });
          gsap.from(parts, { yPercent: 100, autoAlpha: 0, duration: 1, stagger: 0.03, ease: 'expo.out', scrollTrigger: { trigger: title, start: 'top 90%', once: true } });
        }
      });
    });
  }

  if (reduced) chapters.forEach((c) => { c.set(1); c.end(); c.lens(1); });

  return { scroll, chapters };
}
