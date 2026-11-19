import { boot, initSharedScroll, initThemes, lenis, gsap, ScrollTrigger, SplitText, reduced } from '../core.js';
import { initSeeds } from '../modules/seeds.js';
import { prepareHero, introHero } from '../modules/hero.js';
import { sound } from '../modules/sound.js';
import { PixelCat, CAT_SIZE } from '../modules/pixelcat.js';
import { initTypeLab } from '../modules/typelab.js';
import { initPixelIcons } from '../modules/pixelicons.js';

const transitions = boot();
const heroChars = prepareHero();
const heroEl = document.querySelector('.hero');
const heroFrame = document.querySelector('.hero__frame');

/* ---------------------------------------------------------
   Hero scene: lazy-loaded (three + rapier + postprocessing
   only ship on the home page, after first paint).
   Reduced motion renders one still frame; no WebGL keeps the image.
   --------------------------------------------------------- */
let voxel = null;
const heroReady = (async () => {
  const { VoxelHero, webglAvailable } = await import('../modules/voxelhero.js');
  if (!webglAvailable()) return null;
  try {
    voxel = await VoxelHero.create(heroFrame, {
      still: reduced,
      onPush: (n) => sound.tick(Math.min(1, n / 40)),
      onBite: () => sound.nom(),
    });
    if (import.meta.env.DEV) window.__hero = voxel;
    // reveal the live canvas once it has drawn a frame
    requestAnimationFrame(() => requestAnimationFrame(() => heroEl.classList.add('has-gl')));
    return voxel;
  } catch (err) {
    console.warn('[hero] WebGL scene unavailable, keeping the still', err);
    return null;
  }
})();

// sound toggle: off by default
const soundBtn = document.querySelector('[data-sound]');
if (soundBtn) {
  soundBtn.addEventListener('click', () => sound.toggle());
  sound.subscribe((on) => {
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.querySelector('[data-sound-label]').textContent = on ? 'Sound on' : 'Sound off';
  });
}

// labs
const labSeeds = document.querySelector('.lab__seeds');
if (labSeeds) initSeeds(labSeeds);
initTypeLab(document.querySelector('[data-type-lab]'));
initPixelIcons();

lenis?.stop();
if (transitions.arriving) document.querySelector('.loader')?.remove();
(transitions.arriving ? transitions.reveal() : runLoader()).then(() => {
  document.documentElement.classList.remove('is-loading');
  lenis?.start();
  heroReady.then((v) => v?.start());
  if (!reduced) introHero(heroChars);
  initHomeScroll();
  initSharedScroll();
  initThemes();
});

/* ---------------------------------------------------------
   Loader: the mascot eats the watermelon as assets arrive.
   Only on the first visit of a session.
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
  const holder = loader.querySelector('.loader__cat');
  // size the cat to match the page-transition mascot for a seamless hand-off
  const scale = Math.max(3, Math.floor(Math.min(innerWidth * 0.5, innerHeight * 0.3) / CAT_SIZE.w));
  holder.style.width = holder.style.height = `${CAT_SIZE.w * scale}px`;
  const cat = new PixelCat(holder.querySelector('canvas'), { autoplay: true, nibble: false, interactive: false, track: false, forceMotion: true });

  const sources = ['/work/whisperleaf/hero.webp', '/work/beads/hero.webp'];
  let done = 0;
  const total = sources.length + 1;
  const progress = { v: 0, target: 0 };
  const bump = () => (progress.target = ++done / total);
  sources.forEach((src) => Object.assign(new Image(), { onload: bump, onerror: bump, src }));
  (document.fonts?.ready ?? Promise.resolve()).then(bump);

  return new Promise((resolve) => {
    const minTime = performance.now() + 1400;
    const tick = () => {
      progress.v += (progress.target - progress.v) * 0.08;
      if (progress.target >= 1 && performance.now() > minTime && progress.v > 0.985) progress.v = 1;
      num.textContent = String(Math.round(progress.v * 100)).padStart(3, '0');
      cat.setProgress(progress.v);
      if (progress.v < 1) return requestAnimationFrame(tick);
      setTimeout(() => {
        cat.celebrate().then(() => {
          gsap.to(loader.querySelectorAll('.loader__meta'), { autoAlpha: 0, duration: 0.3 });
          setTimeout(() => {
            loader.remove();
            cat.destroy();
            transitions.reveal().then(() => {});
            setTimeout(resolve, 250);
          }, 250);
        });
      }, 350);
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

  // Hero: the card opens to full bleed, the cat comes apart into a cloud the camera flies into
  gsap.timeline({
    scrollTrigger: {
      trigger: heroEl,
      start: 'top top',
      end: '+=85%',
      pin: true,
      pinSpacing: true,
      scrub: 0.8,
      onUpdate: (st) => voxel?.setExplode(gsap.parseEase('power1.inOut')(st.progress)),
    },
  })
    .to(heroEl, { '--k': 0, ease: 'power2.inOut', duration: 0.55 }, 0)
    .fromTo('.hero__content', { yPercent: 0, opacity: 1 }, { yPercent: -18, opacity: 0, ease: 'power2.in', duration: 0.45, immediateRender: false }, 0)
    .fromTo('.hero__corners, .hero__scroll, .hero__hint, .hero__sound', { opacity: 1 }, { opacity: 0, duration: 0.25, immediateRender: false }, 0)
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
  const ms = SplitText.create(manifesto, { type: 'words', wordsClass: 'word' });
  gsap.to(ms.words, {
    opacity: 1,
    stagger: 0.1,
    ease: 'none',
    scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 50%', scrub: 0.6 },
  });

  // Case cards: media parallax + meta slide
  gsap.utils.toArray('.case-card').forEach((card) => {
    const media = card.querySelector('.case-card__media');
    gsap.fromTo(media, { yPercent: 8 }, { yPercent: -8, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from(card.querySelectorAll('.case-card__info > *'), {
      y: 40,
      autoAlpha: 0,
      stagger: 0.07,
      duration: 1.2,
      ease: 'expo.out',
      scrollTrigger: { trigger: card, start: 'top 75%', once: true },
    });
  });

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
