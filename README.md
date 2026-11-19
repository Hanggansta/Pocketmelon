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

## Art direction (v7): one sheet of paper

The voxel hero (v5–v6) was retired as too busy. v7 is benchmarked against Lusion, Lando Norris, abeto (Messenger, Igloo), Immersive Garden and Garden Eight. The written reflection, in Chinese, is in [`docs/v7-reflection.md`](docs/v7-reflection.md). The rules we took from it:
- one idea per screen;
- ink black and paper, plus one cinnabar seal;
- two type families at poster size;
- interaction you can actually play with.

| Moment | What happens | Module |
|---|---|---|
| Hero | A mounted sheet of xuan paper. Move to paint, rest to re-ink, click to drop ink. It opens with one ensō that runs dry into flying white. The type is set like a magazine opener: a top rule, poster headline, vertical 墨分五色 and a seal. | `inkscenes.js` → `ink/fluid.js` |
| Hero → scroll | The mounted sheet opens to full bleed and the copy lifts away. | `src/pages/home.js` |
| 品 (studio) | Alum resist (矾水显字). The sheet is sized everywhere except the character. A wash beads off the sizing and soaks into 品, so the character surfaces under your hand. Touch and reduced motion get the wash laid automatically. | `inkscenes.js` (`initAlum`) |
| 一笔墨 (labs) | Mouse only, no text input. Drag to write, tap to drop ink. Five tones (焦浓重淡清), plus a new sheet. | `inkscenes.js` (`initInkLab`) |

**Ink engine** (`src/modules/ink/fluid.js`, WebGL2 + `EXT_color_buffer_float`, no three.js), after MoXi (Chu & Tai 2005):
1. **Stable-fluids velocity:** the brush drags water, and drops push it outward.
2. **Ink field:** wet pigment, water, fixed pigment and dried water mark.
   - Paper holds water up to a fibre-dependent capacity, and only the excess percolates. Blooms therefore stop by themselves with feathered edges.
   - Pigment rides the water upwind and fixes faster at the drying front, which gives edge darkening.
3. **Procedural paper:** cloudy pulp, curling fibres and grain. It drives permeability (洇), dry-brush skips (飞白) and granulation, and is lit as a surface.

The brush is a bristle model:
- streaks across the tip;
- ink load that runs out with distance;
- thinner and drier when fast;
- re-inks when resting.

Each canvas sleeps after 9 s idle or when off-screen. Without WebGL2 you get plain paper; the 品 sheet shows the character set in type.

## Languages (v6): Chinese first

- **中文 is the default** at `/`, English lives at `/en/**`. Each page is written once; copy is inline as `[[中文||English]]` and resolved by the `htmlPartials` plugin in `vite.config.js`, which also sets `<html lang>`, hreflang alternates and prefixes internal links with `/en` on English pages. English entry points are one-line `@page` stubs in `en/`.
- JS strings use `t('中文', 'English')` from `src/modules/i18n.js`.
- Chinese typography (v7): 京華老宋体 KingHwa OldSong for display, Noto Serif SC for reading text (1.8 line-height), Zhi Mang Xing only inside the footer calligraphy. CJK fonts load from an async chunk (`src/fonts-cjk.js`) so ~300 KB of `@font-face` rules never block render; reveals wait for them.
- Line breaking follows 避头尾: SplitText gets `Intl.Segmenter` word boundaries with punctuation glued (`splitOpts`), per-character reveals use `splitCJK()`.

## Ink layer (v6)

Restraint is the rule: one calligraphic artefact per view, cinnabar only for the seal and a single mark.

- `ink/glyph.js`: real-time brush calligraphy (WebGL). Text is rasterised, then written along the reading order with stroke growth, 飞白 dry streaks and 洇 bleed. Now used only for the vertical 瓜熟蒂落 in the footer.
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
