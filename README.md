# Pocketmelon — Studio site

The studio site for **Pocketmelon 口袋瓜**, an independent design & engineering studio in Tokyo.
Benchmark: Awwwards / FWA / Webby winning entries, extended with the "phenomenal" criteria below.

## Pages
| Path | What |
|---|---|
| `/` | Home: hero film, two-case showcase (live engines), studio, work index, Labs, capabilities, process, inquiry |
| `/work/whisperleaf/` | Case study: Whisperleaf. The live reading engine (CEFR grading, threaded lookups) opens the page, followed by a playable reading-desk demo |
| `/work/beads/` | Case study: 口袋瓜拼豆 Beads. The live pattern engine (photo → OKLab-quantised pattern → fused beads) runs in the hero frame |

Pages are plain HTML in a multi-page Vite build. Shared markup lives in `partials/` and is inlined with `<!-- @include name -->` (see `vite.config.js`).

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## v9: a digital studio, not a melon
The name is 口袋瓜, but the motif is the craft itself. v9 drops every melon, pixel-cat and bead motif from the brand layer and replaces it with live demonstrations of digital capability. Notes are in [`docs/v9-notes.md`](docs/v9-notes.md).

| Piece | What | Module |
|---|---|---|
| Hero lettering | The fluid now condenses into 口袋瓜 set in a dry-brush face (平方赖江湖飞扬体, subset to 3 glyphs as `public/fonts/pm-brush.woff2`). Each character is its own span with size, offset and rotation, and the fluid reads each span's box, so the CSS alone composes the lockup. | `herofilm.js`, `ink/water.js` |
| Logo and cursor | 口 as a viewfinder: four corner brackets and a focus pip. The cursor uses the same language: brackets that lock onto links, a label mode and live coordinates. | `partials/header.html`, `cursor.js` |
| Showcase | Two pinned chapters straight after the hero. A small 口 window opens into a live stage while scroll runs the product's own engine, and the HUD prints what the engine is doing. | `cases/showcase.js` |
| 01 · Beads engine | One fragment shader: cell average (mip LOD) → nearest of 48 real bead colours in OKLab → lit, fused torus beads. Stage 0 is the photo, 1 the pattern and 2 the beads. A square lens previews the next stage and the cursor is also the light. Click cycles density. | `cases/beadstage.js` |
| 02 · Reading engine | An Austen passage, graded word by word by CEFR level as a scan line passes. A glass lens magnifies with rim dispersion. Hovering a word threads every occurrence on the page together, and a card shows the gloss beside the line. | `cases/readstage.js` |
| Capabilities | Each service card carries a live hairline specimen of the craft: a journey through a node system, an editable easing curve, a 12-column grid reflowing, and a flow field. | `capabilities.js` |
| Work index | The hover preview opens through a rectangular aperture, swaps with a banded scan wipe, and bends and channel-splits with cursor velocity. | `worklist.js` |

Dark sections are neutral ink-black (`#0B0C0E`) with one acid signal colour (`#D4FF3F`). Ink and guofeng stay where they belong: the hero film, 品 and the 墨与石 labs.

## Adding real captures (screenshots / screen recordings)
1. Put files in `public/work/<slug>/captures/` (`slug` = `whisperleaf` or `beads`).
2. List them in `src/data/captures.json`:
   ```json
   { "whisperleaf": [
       { "src": "/work/whisperleaf/captures/desk.webp", "type": "image", "device": "desktop", "caption": "The reading desk" },
       { "src": "/work/whisperleaf/captures/review.mp4", "type": "video", "device": "mobile", "caption": "Review with context" }
   ] }
   ```
3. The "Screens" section on the case page appears automatically, using desktop browser or phone frames.

Videos autoplay muted and loop, and pause when off-screen. Use H.264 MP4 at 1440px wide or less, 8–15 s, no audio.

## Art direction (v8): ink in water, directed like a film

v7's "one sheet of paper you paint on" was rejected as flat and non-cinematic. v8 rebuilds the hero, the 品 reveal and every lab. Notes on what changed and why are in [`docs/v8-notes.md`](docs/v8-notes.md).

| Moment | What happens | Module |
|---|---|---|
| Hero intro | A GSAP-timed title sequence. Black bars meet on the seam with a credit (口袋瓜 出品) and a running timecode. The bars part to a 2.39:1 letterbox while the camera pulls back. One drop falls and hits the water, then two more follow (one cinnabar). The plumes are drawn into 口袋瓜, the one line of copy resolves out of blur, the letterbox opens and the header slides in. | `herofilm.js` |
| Hero, live | The name keeps breathing and smoking. Stir it apart with the cursor and it gathers again; click to drop ink. | `ink/water.js` |
| Hero → showcase | A 220svh scrubbed scene. The name dissolves into rising smoke, the camera pushes in, and ink floods the frame to pure black, cutting into the black case showcase. | `herofilm.js` (`scroll`) |
| 品 (studio) | Black water. Three drops of milk-white ink fall, one per 口, then the three plumes condense into 品. Stir it and it re-forms. | `pinink.js` |
| Labs | **万粒:** 131,072 GPU particles forming characters, with a cursor vortex, feedback trails and click-to-change. **流沙笺:** Song-dynasty marbled paper by exact Jaffer–Lu marbling maths, evaluated per pixel (no resampling blur); hold to drop, drag to comb, four pigments. **玉印:** a ray-marched jade seal with a cinnabar-inked relief face and subsurface scattering; drag to turn, click to change stone. | `labs/grains.js`, `labs/marble.js`, `labs/seal.js` |
| Stages | Each WebGL stage opens like a shutter on scroll (scrubbed clip-path plus a push-in). | `src/pages/home.js` |

**Ink engine** (`src/modules/ink/water.js`: WebGL2 + float targets, no three.js):
- **Fluid:** stable fluids (semi-Lagrangian advection, 20 Jacobi pressure iterations) with vorticity confinement for the fine scrolls ink makes in water.
- **Ink behaviour:** buoyancy (ink sinks and mushrooms) and curl-noise ambient currents.
- **Glyph condensation:** a drift applied only to the dye climbs a blurred glyph field, while a breathing source keeps strokes alive.
- **Four dye channels:** rendered by Beer–Lambert absorbance on paper (mode 0) or by scattering in black water (mode 1), with density-gradient lighting, chromatic aberration, vignette, grain and a scroll-driven fbm flood.
- **Shared helpers:** `src/modules/gl/gl2.js` is the shared WebGL2 kit, and `visibleLoop` only renders on-screen stages.
- **Fallbacks:** without WebGL2 the hero shows the type in ink, 品 is set in type, and the labs show a placeholder.
- **Reduced motion:** the hero skips the film and pre-settles the simulation.

## Languages (v6): Chinese first

- **中文 is the default** at `/`, English lives at `/en/**`. Each page is written once; copy is inline as `[[中文||English]]` and resolved by the `htmlPartials` plugin in `vite.config.js`, which also sets `<html lang>`, hreflang alternates and prefixes internal links with `/en` on English pages. English entry points are one-line `@page` stubs in `en/`.
- JS strings use `t('中文', 'English')` from `src/modules/i18n.js`.
- Chinese typography (v7): 京華老宋体 KingHwa OldSong for display and Noto Serif SC for reading text (1.8 line-height). CJK fonts load from an async chunk (`src/fonts-cjk.js`) so ~300 KB of `@font-face` rules never block render; reveals wait for them.
- Line breaking follows 避头尾: SplitText gets `Intl.Segmenter` word boundaries with punctuation glued (`splitOpts`), per-character reveals use `splitCJK()`.

## Ink layer
Restraint is the rule. Ink lives only in the hero film, the 品 reveal and the 墨与石 labs. The v6 footer calligraphy and the landscape were removed in v9.

- `transition.js`: ink spreads from the click point, the 口 mark (`#seal` in the header defs) stamps, and the next page opens out of the ink.

## Design system
| Token | Value | Role |
|---|---|---|
| Paper | `#EFEBE3` | Light canvas |
| Rind | `#0B0C0E` | Dark canvas (neutral ink-black since v9) |
| Ink | `#121611` | Text |
| Melon | `#FF4F3F` | Single accent |
| Rind light | `#D4FF3F` | Signal accent on dark |

Type:
- **Instrument Serif** for Latin display (roman and italic) and **京華老宋体** for Chinese display;
- **Noto Serif SC** for Chinese reading text;
- **Geist** for body and **Geist Mono** for labels;
- **PM Brush** (FeiYang subset) only for the hero name;
- **PM Glyphs** (`tools/build-glyphs.py`), a 572-byte pixel font for the arrows and symbols, which none of the brand fonts include.

Styles are split by concern in `src/styles/`: base, brand, home, sections, case, footer, components, ink, showcase, responsive.

## v9.1: fundamentals
A pass over everything the art direction sits on — no visual changes, just fewer traps:

| Piece | What |
|---|---|
| Boot safety net | A watchdog in `<head>` (plus `<noscript>` styles) means a failed module graph or disabled JS can never leave the visitor trapped behind the loader. |
| Keyboard access | Each live engine has a focus-revealed control (`.stage-key`): the beads board changes density on Enter, the reading engine steps its lookups word by word (←/→ too), and a polite live region announces the result. |
| Menu a11y | The mobile menu traps Tab while open, moves focus in on open and returns it to the burger on close. |
| Anchors | `scroll-padding-top` keeps section landings clear of the fixed header (native jumps and Lenis both honour it), and in-page anchors now write the hash to the URL, with back/forward support. |
| SEO & sharing | Absolute `og:image` per page (with `og:image:alt` and `og:url`), Organization + WebSite JSON-LD, `robots.txt`, an hreflang-annotated `sitemap.xml`, and a branded bilingual `404.html` (wired into the Vite build). |
| Touch icon | `public/apple-touch-icon.png` rasterises the 口 mark from the favicon geometry; regenerate with `python3 tools/build-touch-icon.py`. |
| Dead weight | Unused Fraunces and 志莽行书 Zhi Mang Xing font stacks removed (the CJK stylesheet drops ~66 KB gzipped). |
| Real bug | On the Whisperleaf case page the beads engine was initialising on the reading stage (`.case-engine` matched both), firing a 404 for `undefined` and compiling a shader that never ran. Engines are now selected by `data-stage`. |

## Benchmark, extended
On top of the Awwwards criteria (design, usability, creativity, content), the site is held to:
1. **One idea, everywhere.** 口 as a viewfinder (the frame you look through) drives the logo, cursor, favicon, transition seal and showcase windows.
2. **Proof over claims.** No made-up clients or awards. Two live products, each shown running its real engine.
3. **Craft details.** Every interaction has its own micro-motion, the custom glyphs match the brand, and there are no font fallbacks.
4. **Inclusive by default.** `prefers-reduced-motion` gets a complete static site, focus styles are visible, demos work by keyboard, hover effects are limited to fine pointers, and pages never scroll sideways on mobile.
5. **Performance.** All canvas loops pause when off-screen, there is no three.js dependency, and images are WebP.
6. **A conversion path.** The inquiry builder (need, timeline, details) creates a pre-filled email; the reply time is stated up front.
