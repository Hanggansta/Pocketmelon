import { boot, initSharedScroll, initThemes, lenis, gsap, ScrollTrigger, SplitText, reduced } from '../core.js';
import { initBeadStage } from '../modules/cases/beadstage.js';
import { initReadStage } from '../modules/cases/readstage.js';
import { isZh } from '../modules/i18n.js';
import { initReader } from '../modules/reader.js';
import { initMockups } from '../modules/mockups.js';
import captures from '../data/captures.json';

const slug = document.body.dataset.slug;
const transitions = boot();

renderCaptures();
initMockups();
const demo = document.querySelector('[data-demo]');

// beads: the engine runs in the hero frame; scroll drives photo → pattern → beads
const engineHost = document.querySelector('.case-engine');
const engine = engineHost && initBeadStage(engineHost, {
  onStats: ({ cols, rows, beads, colors, palette }) => {
    const hud = (k) => document.querySelector(`.case-engine__hud [data-hud="${k}"]`);
    hud('grid').textContent = `${cols} × ${rows} · ${beads.toLocaleString()} ${isZh ? '颗' : 'beads'}`;
    hud('colors').textContent = `${colors} / ${palette} ${isZh ? '色' : 'colours'} · OKLab`;
  },
});
// whisperleaf: the reading engine grades the page as it scrolls into view
const readHost = document.querySelector('.case-engine--read');
if (readHost) {
  const hud = (k) => document.querySelector(`.case-engine__hud [data-hud="${k}"]`);
  const reader = initReadStage(readHost, {
    card: readHost.querySelector('.read-card'),
    onStats: (s) => (hud('words').textContent = isZh ? `${s.words} 词 · ${s.lemmas} 词元 · ${s.graded} 分级` : `${s.words} WORDS · ${s.lemmas} LEMMAS · ${s.graded} GRADED`),
  });
  const setScan = (v) => {
    if (!reader) return;
    reader.scan = v;
    hud('scan').textContent = isZh ? `分级 ${Math.round(v * 100)}%` : `GRADING ${Math.round(v * 100)}%`;
  };
  if (reduced) { setScan(1); reader && (reader.lens = 1); }
  else {
    setScan(0);
    ScrollTrigger.create({
      trigger: '.case-media--engine', start: 'top 75%', end: 'center 40%', scrub: true,
      onUpdate: (self) => setScan(self.progress),
      onToggle: (self) => reader && (reader.lens = self.isActive || self.progress >= 1 ? 1 : 0),
    });
  }
}
if (engine) {
  const steps = isZh ? ['照片', '图纸', '拼豆'] : ['PHOTO', 'PATTERN', 'BEADS'];
  const setStage = (v) => {
    engine.stage = v;
    const el = document.querySelector('.case-engine__hud [data-hud="step"]');
    if (el) el.textContent = steps[v < 0.6 ? 0 : v < 1.5 ? 1 : 2];
  };
  if (reduced) { setStage(2); engine.lens = 1; }
  else {
    setStage(0);
    ScrollTrigger.create({
      trigger: '.case-media--engine', start: 'top 70%', end: 'bottom 35%', scrub: true,
      onUpdate: (self) => setStage(Math.min(2, Math.max(0, (self.progress - 0.1) / 0.75 * 2))),
      onToggle: (self) => (engine.lens = self.isActive ? 1 : 0),
    });
  }
}
if (demo?.dataset.demo === 'reader') initReader(demo);

// hero title chars
const title = document.querySelector('.case-hero__title');
const split = SplitText.create(title, { type: 'chars', charsClass: 'char' });
if (!reduced) {
  gsap.set(split.chars, { yPercent: 115 });
  gsap.set('.case-hero [data-intro]', { y: 24, autoAlpha: 0 });
}

lenis?.stop();
(transitions.arriving ? transitions.reveal() : Promise.resolve()).then(() => {
  document.documentElement.classList.remove('is-loading');
  lenis?.start();
  if (!reduced) {
    gsap
      .timeline({ defaults: { ease: 'expo.out' } })
      .to(split.chars, { yPercent: 0, duration: 1.5, stagger: 0.035 }, 0)
      .to('.case-hero [data-intro]', { y: 0, autoAlpha: 1, duration: 1.2, stagger: 0.06 }, 0.3);
    initCaseScroll();
  }
  initSharedScroll();
  initThemes();
});

function initCaseScroll() {
  // hero media: rises and opens out
  gsap.fromTo(
    '.case-media__frame',
    { clipPath: 'inset(8% 6% 0% 6% round 24px)' },
    {
      clipPath: 'inset(0% 0% 0% 0% round 0px)',
      ease: 'none',
      scrollTrigger: { trigger: '.case-media', start: 'top 85%', end: 'top 10%', scrub: true },
    }
  );
  gsap.fromTo('.case-media__frame img, .case-media__frame .mosaic__canvas', { scale: 1.2 }, {
    scale: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.case-media', start: 'top bottom', end: 'bottom top', scrub: true },
  });

  // chapters: number ticks over as each chapter becomes active
  gsap.utils.toArray('.chapter').forEach((ch) => {
    ScrollTrigger.create({ trigger: ch, start: 'top 55%', end: 'bottom 55%', toggleClass: 'is-active' });
  });

  // parallax detail
  gsap.utils.toArray('[data-parallax]').forEach((el) => {
    gsap.fromTo(el, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // next project: fill bar tracks how close you are to the end
  const next = document.querySelector('.case-next');
  if (next) {
    gsap.fromTo(next.querySelector('.case-next__fill'), { scaleX: 0 }, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { trigger: next, start: 'top bottom', end: 'bottom bottom', scrub: true },
    });
  }
}

function renderCaptures() {
  const host = document.querySelector('[data-captures]');
  const list = captures[slug] || [];
  if (!host || !list.length) return;
  const grid = host.querySelector('.captures__grid');
  grid.innerHTML = list
    .map((c) => {
      const media =
        c.type === 'video'
          ? `<video src="${c.src}" ${reduced ? 'controls' : 'autoplay'} muted loop playsinline preload="metadata" aria-label="${c.caption || ''}"></video>`
          : `<img src="${c.src}" alt="${c.caption || ''}" loading="lazy" />`;
      return `<figure class="device device--${c.device || 'desktop'}" data-reveal>
        <div class="device__chrome">${c.device === 'mobile' ? '' : '<i></i><i></i><i></i>'}</div>
        <div class="device__screen">${media}</div>
        ${c.caption ? `<figcaption class="mono">${c.caption}</figcaption>` : ''}
      </figure>`;
    })
    .join('');
  host.hidden = false;
  if (reduced) return;
  // play recordings only while on screen
  const io = new IntersectionObserver((entries) =>
    entries.forEach((e) => (e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause()))
  );
  grid.querySelectorAll('video').forEach((v) => io.observe(v));
}
