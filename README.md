# Pocketmelon — Studio site

The studio site for **Pocketmelon 口袋瓜**, an independent design & engineering studio in Tokyo.
Benchmark: Awwwards / FWA / Webby winning entries, extended with the "phenomenal" criteria below.

## Pages
| Path | What |
|---|---|
| `/` | Home: hero, feature, studio principles, selected work, Labs, services, process, inquiry |
| `/work/whisperleaf/` | Case study: Whisperleaf, with a playable reading-desk demo (lookup → keep → review → return, sentence XRay) |
| `/work/beads/` | Case study: 口袋瓜拼豆 Beads, with a playable bead board (paint, load mascot, iron, save PNG) |

Pages are plain HTML in a multi-page Vite build. Shared markup lives in `partials/` and is inlined with `<!-- @include name -->` (see `vite.config.js`).

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## The mascot
The pixel cat from the logo is rebuilt as a **44×44 living sprite** (`src/modules/pixelcat.js`) and drawn on canvas at a stepped 12 fps:
it blinks, watches the cursor, nibbles the melon bite by bite (with crumbs), celebrates and regrows the slice.
It shows up in the header logo, the loader (it eats the melon as the page loads), page transitions, Labs, the Beads hero and the inquiry form (it pops when you pick options).

- Source of truth: `tools/build-sprite.py`. It writes `src/modules/cat-sprite.json`, `public/favicon.svg` and `public/brand/pocketmelon-mark.svg`.
- Run it with `python3 tools/build-sprite.py` (needs Pillow for the preview image).

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
| Hero → feature | A 220svh scrubbed scene. The name dissolves into rising smoke, the camera pushes in, and ink floods the frame to pure black, cutting into the black feature section. | `herofilm.js` (`scroll`) |
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
- Chinese typography (v7): 京華老宋体 KingHwa OldSong for display, Noto Serif SC for reading text (1.8 line-height), Zhi Mang Xing only inside the footer calligraphy. CJK fonts load from an async chunk (`src/fonts-cjk.js`) so ~300 KB of `@font-face` rules never block render; reveals wait for them.
- Line breaking follows 避头尾: SplitText gets `Intl.Segmenter` word boundaries with punctuation glued (`splitOpts`), per-character reveals use `splitCJK()`.

## Ink layer (v6)

Restraint is the rule: one calligraphic artefact per view, cinnabar only for the seal and a single mark.

- `ink/glyph.js`: real-time brush calligraphy (WebGL). Text is rasterised, then written along the reading order with stroke growth, 飞白 dry streaks and 洇 bleed. Used only for the vertical 瓜熟蒂落 in the footer.
- `ink/mountains.js`: the footer scroll painting: five ridges of ink density, mist and cloud bands, a small cinnabar sun.
- `transition.js`: ink spreads from the click point, the studio seal (口袋瓜印, `#seal` in the header defs) stamps, the next page opens out of the ink.
- `worklist.js`: the work index; on desktop a floating preview follows the cursor and changes project through an ink blot.

## Design system
| Token | Value | Role |
|---|---|---|
| Paper | `#EFEBE3` | Light canvas |
| Rind | `#15231A` | Dark canvas |
| Ink | `#121611` | Text |
| Melon | `#FF4F3F` | Single accent |
| Rind light | `#B9D98A` | Accent on dark |
| Beads cream | `#FDF9EF` | Mascot stages (from the Beads app) |

Type:
- **Instrument Serif** for Latin display (roman and italic) and **京華老宋体** for Chinese display;
- **Noto Serif SC** for Chinese reading text;
- **Fraunces** only inside the elastic-type lab (variable axes);
- **Geist** for body and **Geist Mono** for labels;
- **Pixelify Sans** for the pixel wordmark and loader;
- **PM Glyphs** (`tools/build-glyphs.py`), a 572-byte pixel font for the arrows and symbols, which none of the brand fonts include.

Styles are split by concern in `src/styles/`: base, brand, home, sections, case, footer, responsive.

## Benchmark, extended
On top of the Awwwards criteria (design, usability, creativity, content), the site is held to:
1. **One idea, everywhere.** The pixel/bead grid drives the logo, loader, transitions, image reveals, glyphs and demos.
2. **Proof over claims.** No made-up clients or awards. Two live products, each with a playable demo.
3. **Craft details.** Every interaction has its own micro-motion, the custom glyphs match the brand, and there are no font fallbacks.
4. **Inclusive by default.** `prefers-reduced-motion` gets a complete static site, focus styles are visible, demos work by keyboard, hover effects are limited to fine pointers, and pages never scroll sideways on mobile.
5. **Performance.** All canvas loops pause when off-screen, there is no WebGL dependency, and images are WebP.
6. **A conversion path.** The inquiry builder (need, timeline, details) creates a pre-filled email; the reply time is stated up front.
