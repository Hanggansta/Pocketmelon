import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
// Chinese: 京華老宋体 for display, 思源宋体 for reading text, 思源黑体 as the web fallback
// behind PingFang / YaHei. All unicode-range sliced, so only the glyphs a page uses download.
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

import { reduced, finePointer } from './modules/env.js';
import { initCursor } from './modules/cursor.js';
import { initMagnetic, initClocks, initCopy } from './modules/ui.js';
import { initTransitions } from './modules/transition.js';
import { initMosaics } from './modules/mosaic.js';
import { t, splitOpts } from './modules/i18n.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const html = document.documentElement;
export let lenis = null;

/** Shared boot for every page. Returns once the page is ready to animate in. */
export { cjkReady } from './modules/fonts.js';
import { cjkReady } from './modules/fonts.js';

export function boot() {
  history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);
  if (!finePointer) html.classList.add('no-cursor');

  if (!reduced) {
    lenis = new Lenis({ lerp: 0.085, touchMultiplier: 1.4 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const transitions = initTransitions();
  initClocks();
  initCopy();
  if (finePointer) initCursor();
  initHeader();
  initMenu();
  initAnchors();
  initMagnetic();
  initMosaics();
  initInquiry();
  // never open the ink onto half-swapped headlines
  const reveal = transitions.reveal;
  transitions.reveal = () => cjkReady.then(reveal);
  return transitions;
}

/** Scroll-linked reveals shared by all pages; call after the page is visible. */
export function initSharedScroll() {
  if (reduced) return;

  document.querySelectorAll('[data-split]').forEach((el) => {
    SplitText.create(el, {
      ...splitOpts,
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

  gsap.utils.toArray('.label, .section-meta').forEach((el) => {
    gsap.from(el, { y: 16, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });

  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (els) => gsap.from(els, { y: 50, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }),
  });

  if (document.querySelector('.cta')) {
    gsap.from('.cta', {
      scale: 0,
      rotate: -90,
      duration: 1.4,
      ease: 'expo.out',
      scrollTrigger: { trigger: '.cta', start: 'top 90%', once: true },
    });
  }

}

/** Background breathes between paper and rind as sections pass. Call last. */
export function initThemes() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = (theme) => {
    if (html.dataset.theme === theme) return;
    html.dataset.theme = theme;
    meta && (meta.content = theme === 'dark' ? '#0b0c0e' : '#efebe3');
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
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

/* --------------------------------------------------------- header */
function initHeader() {
  const header = document.querySelector('.header');
  if (!header) return;
  let last = 0;
  const onScroll = (y) => {
    header.classList.toggle('is-scrolled', y > 40);
    if (!html.classList.contains('menu-open')) header.classList.toggle('is-hidden', y > last && y > 300);
    last = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
}

/* --------------------------------------------------------- mobile menu */
function initMenu() {
  const btn = document.querySelector('.burger');
  const menu = document.querySelector('.menu');
  if (!btn || !menu) return;
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
    btn.setAttribute('aria-label', open ? t('关闭菜单', 'Close menu') : t('打开菜单', 'Open menu'));
    menu.setAttribute('aria-hidden', !open);
    if (open) {
      document.querySelector('.header').classList.remove('is-hidden');
      lenis?.stop();
      tl.timeScale(1).play();
      // move focus into the menu so keyboard users land inside it
      requestAnimationFrame(() => menu.querySelector('a')?.focus({ preventScroll: true }));
    } else {
      lenis?.start();
      tl.timeScale(1.6).reverse();
      btn.focus({ preventScroll: true });
    }
  };
  btn.addEventListener('click', () => toggle());
  links.forEach((a) => a.addEventListener('click', () => toggle(false)));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && toggle(false));
  // keep Tab inside the open menu (burger + menu links form the loop)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !open) return;
    const focusables = [btn, ...menu.querySelectorAll('a')];
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!focusables.includes(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  });
}

/* --------------------------------------------------------- anchors */
function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    e.preventDefault();
    const target = url.hash === '#top' ? 0 : document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (target === null) return;
    // keep the URL honest: the section becomes linkable and survives a reload
    history.pushState(null, '', url.hash === '#top' ? location.pathname + location.search : url.hash);
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else target === 0 ? window.scrollTo(0, 0) : target.scrollIntoView();
  });

  // back / forward between the sections we pushed above
  window.addEventListener('popstate', () => {
    const target = !location.hash || location.hash === '#top' ? 0 : document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target === null) return;
    if (lenis) lenis.scrollTo(target, { duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 4), force: true });
    else target === 0 ? window.scrollTo(0, 0) : target.scrollIntoView();
  });
}

/* --------------------------------------------------------- inquiry builder */
function initInquiry() {
  const form = document.querySelector('[data-inquiry]');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const needs = data.getAll('need').join(t('、', ', ')) || '—';
    const timeline = data.get('timeline') || '—';
    const body = [
      t('你好，口袋瓜：', 'Hi Pocketmelon,'),
      ``,
      data.get('message') || '',
      ``,
      `${t('需要', 'Looking for')}: ${needs}`,
      `${t('时间', 'Timeline')}: ${timeline}`,
      ``,
      `${data.get('name') || ''}`,
      `${data.get('email') || ''}`,
    ].join('\n');
    const subject = `${t('新项目', 'New project')} — ${needs}`;
    form.classList.add('is-sent');
    setTimeout(() => {
      location.href = `mailto:${form.dataset.inquiry}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }, 500);
  });
}

export { gsap, ScrollTrigger, SplitText, reduced, finePointer };
