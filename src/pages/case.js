import { boot, initSharedScroll, initThemes, lenis, gsap, ScrollTrigger, SplitText, reduced } from '../core.js';
import { BeadBoard } from '../modules/beadboard.js';
import { initReader } from '../modules/reader.js';
import captures from '../data/captures.json';

const slug = document.body.dataset.slug;
const transitions = boot();

renderCaptures();
const demo = document.querySelector('[data-demo]');
if (demo?.dataset.demo === 'beads') new BeadBoard(demo, { preset: 'cat' });
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
  gsap.fromTo('.case-media__frame img, .case-media__frame canvas', { scale: 1.2 }, {
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
