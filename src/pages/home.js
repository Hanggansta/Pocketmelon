import { boot, initSharedScroll, initThemes, lenis, gsap, ScrollTrigger, SplitText, reduced, cjkReady } from '../core.js';
import { initHeroFilm } from '../modules/herofilm.js';
import { initPinInk } from '../modules/pinink.js';
import { initWorkList } from '../modules/worklist.js';
import { t, isZh, splitCJK } from '../modules/i18n.js';
import { initGrains } from '../modules/labs/grains.js';
import { initMarble } from '../modules/labs/marble.js';
import { initSeal } from '../modules/labs/seal.js';
import { initCapabilities } from '../modules/capabilities.js';
import { initShowcase } from '../modules/cases/showcase.js';

const transitions = boot();

/* ---------------------------------------------------------
   Hero: a title sequence shot in ink and water (see herofilm.js).
   --------------------------------------------------------- */
const film = initHeroFilm(document.querySelector('.hero'), { fontsReady: cjkReady });

// labs
initGrains(document.querySelector('[data-lab-grains]'), { fontsReady: cjkReady });
initMarble(document.querySelector('[data-lab-marble]'));
initSeal(document.querySelector('[data-lab-seal]'), { fontsReady: cjkReady });
initCapabilities();
initWorkList(document.querySelector('[data-worklist]'));
const showcase = initShowcase(document.querySelector('.showcase'));
initPinInk(document.querySelector('[data-pin-ink]'), { fontsReady: cjkReady });

lenis?.stop();
if (transitions.arriving) document.querySelector('.loader')?.remove();
(transitions.arriving ? transitions.reveal() : runLoader()).then(() => {
  document.documentElement.classList.remove('is-loading');
  lenis?.start();
  film.intro();
  initHomeScroll();
  initSharedScroll();
  initThemes();
});

/* ---------------------------------------------------------
   Loader: ink is ground (000→100) while assets arrive, the seal is
   pressed, then the ink opens onto the page. First visit per session.
   --------------------------------------------------------- */
function runLoader() {
  const loader = document.querySelector('.loader');
  const seen = sessionStorage.getItem('pm:loaded') === '1';
  if (!loader) return Promise.resolve();
  if (reduced || seen) {
    loader.remove();
    return Promise.resolve();
  }
  sessionStorage.setItem('pm:loaded', '1');
  const num = loader.querySelector('.loader__num');
  const seal = loader.querySelector('.loader__seal');

  const sources = ['/work/beads/source.webp'];
  let done = 0;
  const total = sources.length + 1;
  const progress = { v: 0, target: 0 };
  const bump = () => (progress.target = ++done / total);
  sources.forEach((src) => Object.assign(new Image(), { onload: bump, onerror: bump, src }));
  cjkReady.then(bump);

  return new Promise((resolve) => {
    const minTime = performance.now() + 1500;
    const tick = () => {
      progress.v += (progress.target - progress.v) * 0.07;
      if (progress.target >= 1 && performance.now() > minTime && progress.v > 0.985) progress.v = 1;
      num.textContent = String(Math.round(progress.v * 100)).padStart(3, '0');
      loader.style.setProperty('--load', progress.v.toFixed(3));
      if (progress.v < 1) return requestAnimationFrame(tick);
      // press the seal, hold a beat, then open the ink
      gsap.timeline()
        .fromTo(seal, { scale: 1.35, autoAlpha: 0, rotate: -4 }, { scale: 1, autoAlpha: 1, rotate: 0, duration: 0.45, ease: 'back.out(2.2)' })
        .to(loader.querySelector('.loader__meta'), { autoAlpha: 0, duration: 0.35 }, 0.2)
        .add(() => {
          loader.remove();
          transitions.reveal();
          setTimeout(resolve, 300);
        }, 0.95);
    };
    requestAnimationFrame(tick);
  });
}

/* ---------------------------------------------------------
   Home choreography
   --------------------------------------------------------- */
function initHomeScroll() {
  if (reduced) return;
  const mm = gsap.matchMedia();

  film.scroll();

  showcase?.scroll();

  // Stages open like a shutter as they arrive, the picture inside settling from a slight push-in
  gsap.utils.toArray('.lab__stage, .pin__art').forEach((st) => {
    gsap.timeline({ scrollTrigger: { trigger: st, start: 'top 98%', end: 'top 30%', scrub: 0.7 } })
      .fromTo(st, { clipPath: 'inset(16% 12% 16% 12%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.out' }, 0)
      .fromTo(st.querySelector('canvas'), { scale: 1.18 }, { scale: 1, ease: 'power2.out' }, 0);
  });

  // Manifesto words light up
  const manifesto = document.querySelector('[data-words]');
  const msParts = isZh ? splitCJK(manifesto) : SplitText.create(manifesto, { type: 'words', wordsClass: 'word' }).words;
  gsap.to(msParts, {
    opacity: 1,
    stagger: 0.1,
    ease: 'none',
    scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 50%', scrub: 0.6 },
  });

  // Work list: rows draw their rule and slide in
  gsap.utils.toArray('.wl__row').forEach((row, i) => {
    gsap.from(row.querySelectorAll('.wl__link > *:not(.wl__thumb)'), {
      yPercent: 60,
      autoAlpha: 0,
      duration: 1.1,
      ease: 'expo.out',
      stagger: 0.04,
      delay: i * 0.05,
      scrollTrigger: { trigger: row, start: 'top 88%', once: true },
    });
    gsap.fromTo(row, { '--rule': 0 }, { '--rule': 1, duration: 1.4, ease: 'expo.inOut', scrollTrigger: { trigger: row, start: 'top 92%', once: true } });
  });

  // Services horizontal (desktop)
  mm.add('(min-width: 901px)', () => {
    const track = document.querySelector('.services__track');
    const distance = () => track.scrollWidth - window.innerWidth;
    // the cards lean into the sideways scroll, then settle
    const cards = gsap.utils.toArray('.svc');
    const lean = cards.map((card) => gsap.quickTo(card, 'skewX', { duration: 0.6, ease: 'power3' }));
    const settle = () => lean.forEach((set) => set(0));
    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: '.services__pin',
        start: 'top top',
        end: () => '+=' + distance(),
        pin: true,
        scrub: 0.8,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const v = gsap.utils.clamp(-1.5, 1.5, self.getVelocity() / -2800);
          lean.forEach((set) => set(v));
        },
        onLeave: settle,
        onLeaveBack: settle,
      },
    });
    gsap.to('.services__progress span', {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.services__pin', start: 'top top', end: () => '+=' + distance(), scrub: true },
    });
    gsap.utils.toArray('.svc').forEach((card) => {
      gsap.from(card.querySelector('.svc__num'), {
        xPercent: 40,
        ease: 'none',
        scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'center center', scrub: true },
      });
    });
  });
  mm.add('(max-width: 900px)', () => {
    gsap.utils.toArray('.svc').forEach((card) => {
      gsap.from(card, { y: 60, autoAlpha: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: card, start: 'top 90%', once: true } });
    });
  });

  // Process: progress rail fills as steps pass
  const rail = document.querySelector('.process__rail span');
  if (rail) {
    gsap.to(rail, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.process__steps', start: 'top 60%', end: 'bottom 60%', scrub: true },
    });
    gsap.utils.toArray('.step').forEach((step) =>
      ScrollTrigger.create({ trigger: step, start: 'top 60%', end: 'bottom 60%', toggleClass: 'is-active' })
    );
  }
}
