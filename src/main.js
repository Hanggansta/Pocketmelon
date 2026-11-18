import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

import { reduced, finePointer } from './modules/env.js';
import { initCursor } from './modules/cursor.js';
import { initSeeds } from './modules/seeds.js';
import { prepareHero, introHero, initPillCycle, initProximity } from './modules/hero.js';
import { initWorkHover } from './modules/work.js';
import { initMagnetic, initClocks, initCopy } from './modules/ui.js';

gsap.registerPlugin(ScrollTrigger, SplitText);
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const html = document.documentElement;
if (!finePointer) html.classList.add('no-cursor');

/* ---------------------------------------------------------
   Smooth scroll
   --------------------------------------------------------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, touchMultiplier: 1.4 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

/* ---------------------------------------------------------
   Boot
   --------------------------------------------------------- */
const heroChars = prepareHero();
initSeeds(document.querySelector('.hero__seeds'));
initPillCycle();
initClocks();
initCopy();
if (finePointer) initCursor();

runLoader().then(() => {
  html.classList.remove('is-loading');
  lenis?.start();
  if (!reduced) introHero(heroChars).add(() => initProximity(heroChars), 1.2);
  initScroll();
  initHeader();
  initMenu();
  initMarquees();
  initWorkHover();
  initMagnetic();
  initAnchors();
  // fonts can shift metrics slightly — re-measure once settled
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
});

/* ---------------------------------------------------------
   Loader
   --------------------------------------------------------- */
function runLoader() {
  const loader = document.querySelector('.loader');
  const num = loader.querySelector('.loader__num');
  const fill = loader.querySelector('.loader__fill');

  const assets = Promise.all([
    document.fonts?.ready ?? Promise.resolve(),
    ...['/work/northwind.webp'].map(
      (src) => new Promise((res) => Object.assign(new Image(), { onload: res, onerror: res, src }))
    ),
  ]);

  if (reduced) {
    return assets.then(() => loader.remove());
  }

  return new Promise((resolve) => {
    const counter = { v: 0 };
    const tl = gsap.timeline();
    tl.to(counter, {
      v: 100,
      duration: 2,
      ease: 'power3.inOut',
      onUpdate: () => {
        num.textContent = String(Math.round(counter.v)).padStart(3, '0');
        gsap.set(fill, { scaleX: counter.v / 100 });
      },
    });
    assets.then(() => {
      tl.then(() => {
        gsap
          .timeline({ onComplete: () => loader.remove() })
          .to('.loader__inner > *', { yPercent: -60, autoAlpha: 0, duration: 0.7, ease: 'power3.in', stagger: 0.05 })
          .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, '-=0.15')
          .add(resolve, '-=0.75');
      });
    });
  });
}

/* ---------------------------------------------------------
   Scroll-driven choreography
   --------------------------------------------------------- */
function initScroll() {
  if (reduced) {
    document.querySelectorAll('[data-count]').forEach((n) => (n.textContent = n.dataset.count));
    initThemes();
    return;
  }

  const mm = gsap.matchMedia();

  /* Feature: card expands into full-bleed */
  mm.add({ desktop: '(min-width: 901px)', mobile: '(max-width: 900px)' }, (ctx) => {
    const from = ctx.conditions.desktop ? 'inset(22% 31% 22% 31% round 28px)' : 'inset(30% 14% 30% 14% round 20px)';
    const header = document.querySelector('.header');
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.feature',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        onUpdate: (self) => header.classList.toggle('on-media', self.progress > 0.35 && self.progress < 0.995),
        onLeave: () => header.classList.remove('on-media'),
        onLeaveBack: () => header.classList.remove('on-media'),
      },
    });
    tl.fromTo('.feature__media', { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
      .fromTo('.feature__media img', { scale: 1.35 }, { scale: 1, ease: 'power2.inOut', duration: 1 }, 0)
      .to('.feature__shade', { opacity: 1, duration: 0.4 }, 0.6)
      .fromTo('.feature__copy > *, .feature__corner > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.35, ease: 'power3.out' }, 0.72)
      .to({}, { duration: 0.15 });
  });

  /* Manifesto words light up with scroll */
  const manifesto = document.querySelector('[data-words]');
  const ms = SplitText.create(manifesto, { type: 'words', wordsClass: 'word' });
  gsap.to(ms.words, {
    opacity: 1,
    stagger: 0.1,
    ease: 'none',
    scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 50%', scrub: 0.6 },
  });

  /* Headline line reveals */
  document.querySelectorAll('[data-split]').forEach((el) => {
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'line',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 115,
          rotate: 3,
          transformOrigin: '0 100%',
          duration: 1.4,
          ease: 'expo.out',
          stagger: 0.1,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        }),
    });
  });

  /* Labels & meta */
  gsap.utils.toArray('.label, .section-meta').forEach((el) => {
    gsap.from(el, { y: 16, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });

  /* Stats: count up + rule draw */
  gsap.utils.toArray('.stat').forEach((stat, i) => {
    const n = stat.querySelector('[data-count]');
    const obj = { v: 0 };
    gsap.from(stat, { y: 40, autoAlpha: 0, duration: 1.2, delay: i * 0.08, ease: 'expo.out', scrollTrigger: { trigger: stat, start: 'top 90%', once: true } });
    gsap.to(obj, {
      v: +n.dataset.count,
      duration: 2,
      delay: i * 0.08,
      ease: 'power3.out',
      onUpdate: () => (n.textContent = Math.round(obj.v)),
      scrollTrigger: { trigger: stat, start: 'top 90%', once: true },
    });
  });

  /* Rows stagger in */
  ['.work__item', '.award', '.footer__col'].forEach((sel) => {
    ScrollTrigger.batch(sel, {
      start: 'top 92%',
      once: true,
      onEnter: (els) => gsap.from(els, { y: 50, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }),
    });
  });

  /* Services horizontal scroll (desktop) */
  mm.add('(min-width: 901px)', () => {
    const track = document.querySelector('.services__track');
    const distance = () => track.scrollWidth - window.innerWidth;
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

  /* CTA pop */
  gsap.from('.cta', {
    scale: 0,
    rotate: -90,
    duration: 1.4,
    ease: 'expo.out',
    scrollTrigger: { trigger: '.footer__top', start: 'top 75%', once: true },
  });

  /* Giant wordmark rises letter by letter */
  gsap.from('.footer__word span', {
    yPercent: 100,
    ease: 'none',
    stagger: 0.04,
    scrollTrigger: { trigger: '.footer__word', start: 'top bottom', end: 'bottom bottom', scrub: 0.6 },
  });

  initThemes();
}

/* Background breathes between paper and rind as sections pass */
function initThemes() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = (theme) => {
    if (html.dataset.theme === theme) return;
    html.dataset.theme = theme;
    meta.content = theme === 'dark' ? '#15231a' : '#efebe3';
  };
  document.querySelectorAll('[data-theme-section]').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 55%',
      onEnter: () => apply(section.dataset.themeSection),
      onEnterBack: () => apply(section.dataset.themeSection),
    });
  });
  ScrollTrigger.refresh();
}

/* ---------------------------------------------------------
   Header behaviour
   --------------------------------------------------------- */
function initHeader() {
  const header = document.querySelector('.header');
  let last = 0;
  const onScroll = (y) => {
    header.classList.toggle('is-scrolled', y > 40);
    if (!html.classList.contains('menu-open')) {
      header.classList.toggle('is-hidden', y > last && y > 300);
    }
    last = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
}

/* ---------------------------------------------------------
   Mobile menu
   --------------------------------------------------------- */
function initMenu() {
  const btn = document.querySelector('.burger');
  const menu = document.querySelector('.menu');
  const links = menu.querySelectorAll('.menu__list a');
  let open = false;

  const tl = gsap
    .timeline({ paused: true, defaults: { ease: 'expo.inOut' } })
    .set(menu, { visibility: 'visible' })
    .to(menu, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9 })
    .from(links, { yPercent: 110, duration: 1, ease: 'expo.out', stagger: 0.06 }, 0.4)
    .from('.menu__foot', { autoAlpha: 0, y: 10, duration: 0.6 }, 0.7);

  const toggle = (state = !open) => {
    open = state;
    html.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', !open);
    if (open) {
      document.querySelector('.header').classList.remove('is-hidden');
      lenis?.stop();
      tl.timeScale(1).play();
    } else {
      lenis?.start();
      tl.timeScale(1.6).reverse();
    }
  };
  btn.addEventListener('click', () => toggle());
  links.forEach((a) => a.addEventListener('click', () => toggle(false)));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && toggle(false));
}

/* ---------------------------------------------------------
   Velocity-reactive marquees
   --------------------------------------------------------- */
function initMarquees() {
  document.querySelectorAll('[data-marquee]').forEach((m) => {
    const track = m.querySelector('.marquee__track');
    track.innerHTML += track.innerHTML; // duplicate for seamless loop
    track.querySelectorAll('span, i').forEach((n, i) => i >= track.children.length / 2 && n.setAttribute('aria-hidden', 'true'));
    const baseDir = +(m.dataset.dir || 1);
    let x = 0;
    let dir = baseDir;
    let skew = 0;
    const skewTo = gsap.quickSetter(track, 'skewX', 'deg');
    const setX = gsap.quickSetter(track, 'x', 'px');

    gsap.ticker.add((_, dt) => {
      if (reduced) return;
      const half = track.scrollWidth / 2;
      const v = lenis ? lenis.velocity : 0;
      if (v > 0.5) dir = baseDir;
      else if (v < -0.5) dir = -baseDir;
      const speed = (0.045 + Math.min(Math.abs(v) * 0.02, 0.6)) * dt;
      x -= speed * dir;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      skew += (gsap.utils.clamp(-8, 8, -v * 0.35 * baseDir) - skew) * 0.1;
      setX(x);
      skewTo(skew);
    });
  });
}

/* ---------------------------------------------------------
   Anchors
   --------------------------------------------------------- */
function initAnchors() {
  document.querySelectorAll('[data-scroll-to]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href?.startsWith('#')) return;
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(href === '#top' ? 0 : href, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
      } else {
        href === '#top' ? window.scrollTo(0, 0) : document.querySelector(href)?.scrollIntoView();
      }
    });
  });
}
