import { boot, initSharedScroll, initThemes, lenis, gsap, ScrollTrigger, SplitText, reduced, cjkReady } from '../core.js';
import { initSeeds } from '../modules/seeds.js';
import { prepareHero, introHero } from '../modules/hero.js';
import { initHeroInk, enso, initAlum, initInkLab } from '../modules/inkscenes.js';
import { initWorkList } from '../modules/worklist.js';
import { initInkGlyphs } from '../modules/ink/glyph.js';
import { t, isZh, splitCJK } from '../modules/i18n.js';
import { initTypeLab } from '../modules/typelab.js';
import { initPixelIcons } from '../modules/pixelicons.js';

const transitions = boot();
const heroChars = prepareHero();
const heroEl = document.querySelector('.hero');
const heroFrame = document.querySelector('.hero__frame');

/* ---------------------------------------------------------
   Hero: a sheet of xuan paper the visitor paints on (WebGL2 ink sim).
   No WebGL2 keeps the plain paper and the type.
   --------------------------------------------------------- */
const heroInk = initHeroInk(heroFrame);

// labs
const labSeeds = document.querySelector('.lab__seeds');
if (labSeeds) initSeeds(labSeeds);
initTypeLab(document.querySelector('[data-type-lab]'));
initPixelIcons();
initWorkList(document.querySelector('[data-worklist]'));
initInkGlyphs(document.querySelector('main'));
initAlum(document.querySelector('[data-alum]'));
initInkLab(document.querySelector('[data-ink-lab]'));

lenis?.stop();
if (transitions.arriving) document.querySelector('.loader')?.remove();
(transitions.arriving ? transitions.reveal() : runLoader()).then(() => {
  document.documentElement.classList.remove('is-loading');
  lenis?.start();
  setTimeout(() => enso(heroInk), reduced ? 0 : 450);
  if (!reduced) introHero(heroChars);
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

  const sources = ['/work/whisperleaf/hero.webp'];
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

  // Hero: the mounted sheet opens to full bleed as the type lifts away
  gsap.timeline({
    scrollTrigger: {
      trigger: heroEl,
      start: 'top top',
      end: '+=85%',
      pin: true,
      pinSpacing: true,
      scrub: 0.8,
    },
  })
    .to(heroEl, { '--k': 0, ease: 'power2.inOut', duration: 0.55 }, 0)
    .fromTo('.hero__content', { yPercent: 0, opacity: 1 }, { yPercent: -18, opacity: 0, ease: 'power2.in', duration: 0.45, immediateRender: false }, 0)
    .fromTo('.hero__top, .hero__scroll, .hero__hint, .hero__vert', { opacity: 1 }, { opacity: 0, duration: 0.25, immediateRender: false }, 0)
    .to({}, { duration: 0.45 });

  // Feature card expands into full-bleed
  mm.add({ desktop: '(min-width: 901px)', mobile: '(max-width: 900px)' }, (ctx) => {
    const from = ctx.conditions.desktop ? 'inset(22% 31% 22% 31% round 28px)' : 'inset(30% 14% 30% 14% round 20px)';
    const header = document.querySelector('.header');
    const featureMedia = document.querySelector('.feature__media');
    gsap
      .timeline({
        scrollTrigger: {
          trigger: '.feature',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1,
          onUpdate: (self) => {
            header.classList.toggle('on-media', self.progress > 0.35 && self.progress < 0.995);
            // a low-res render that sharpens into the product as it fills the screen
            featureMedia._mosaic?.set(reduced ? 1 : Math.max(14, Math.min(28, innerWidth / 50)) * Math.pow(1 - Math.min(1, self.progress / 0.62), 1.6));
          },
          onLeave: () => header.classList.remove('on-media'),
          onLeaveBack: () => header.classList.remove('on-media'),
        },
      })
      .fromTo('.feature__media', { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
      .fromTo('.feature__media img, .feature__media .mosaic__canvas', { scale: 1.35 }, { scale: 1, ease: 'power2.inOut', duration: 1 }, 0)
      .to('.feature__shade', { opacity: 1, duration: 0.4 }, 0.6)
      .fromTo('.feature__copy > *, .feature__corner > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.35, ease: 'power3.out' }, 0.72)
      .to({}, { duration: 0.15 });
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

  // 三口成品: the three mouths stack, then the character is written
  const marks = gsap.utils.toArray('.pin__marks i');
  if (marks.length) {
    gsap.from(marks, { y: 30, autoAlpha: 0, stagger: 0.12, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '.pin', start: 'top 70%', once: true } });
  }

  // Services horizontal (desktop)
  mm.add('(min-width: 901px)', () => {
    const track = document.querySelector('.services__track');
    const distance = () => track.scrollWidth - window.innerWidth;
    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: { trigger: '.services__pin', start: 'top top', end: () => '+=' + distance(), pin: true, scrub: 0.8, invalidateOnRefresh: true },
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
