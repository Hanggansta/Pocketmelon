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

## Art direction (v5): one strong real-time scene, quiet everything else

Researched against Lusion, Active Theory, Immersive Garden and basement.studio. What we took from **Lusion's thinking**, not just its look:

1. **Show, in real time.** The hero is a live scene you can touch before you read a word, not a video.
2. **Frame the 3D.** The scene lives in a rounded card, so navigation and the headline stay calm, readable HTML (a real `<h1>`, sentence case, short mono labels, a centred crosshair "Scroll to explore").
3. **Film, not demo.** Depth of field, soft shadows, grain and a gentle vignette.
4. **One idea, fewer effects.** v4's ghost cursor, artboard grid, selection frames and scroll-flick pixelation were retired so the hero is the single focal point.
5. **Sound is optional.** A side toggle, off by default.

| Moment | What happens | Module |
|---|---|---|
| Hero | The mascot as ~1,200 glossy rounded voxels (three.js `InstancedMesh`, clearcoat, studio light, soft shadows). A small custom solver (no WASM) treats each voxel as a spring to its home cell. The cursor is a sphere collider that shoves them; a click is a radial impulse and feeds the cat. Bitten melon voxels drop and bounce on the floor. The sprite still blinks, twitches and follows you with its eyes, and changed pixels flip physically. | `src/modules/voxelhero.js` |
| Hero → scroll | The section pins: the card opens to full bleed, the copy lifts away, the cat comes apart into a cloud and the camera flies into it. Reversible. | `src/pages/home.js` |
| Post | Depth of field (desktop), film grain, vignette, SMAA or MSAA. | `postprocessing` |
| Sound | Synthesized WebAudio ticks when voxels are shoved, a soft "nom" per bite. Off by default, remembered per session. | `src/modules/sound.js` |
| Loader | 000→100 counter; the cat eats the melon as assets arrive (first visit per session). | `src/pages/home.js` |
| Labs | Elastic type, pixel-resolve on hover, the pet. | `typelab.js`, `mosaic.js` |
| Services | 12×12 pixel icons. | `pixelicons.js` |
| Footer | The pixel wordmark. | `pixeltext.js` |

**Performance and fallbacks**
- three + postprocessing (~212 kB gzipped) load only on the home page, as a lazy chunk after first paint.
- Quality tiers: mobile has no DOF, DPR ≤ 1.5 and a smaller shadow map. A frame-time governor sheds resolution, then DOF, if frames run long. Resting voxels sleep, and the loop pauses off-screen.
- Phones tilt the sculpture with the device (where orientation is available without a prompt).
- `prefers-reduced-motion`: one settled frame, no simulation, no pin.
- No WebGL: `public/hero/still.webp`, rendered from the live scene. To regenerate it, screenshot the frame with reduced motion on.

## Languages (v6): Chinese first

- **中文 is the default** at `/`, English lives at `/en/**`. Each page is written once; copy is inline as `[[中文||English]]` and resolved by the `htmlPartials` plugin in `vite.config.js`, which also sets `<html lang>`, hreflang alternates and prefixes internal links with `/en` on English pages. English entry points are one-line `@page` stubs in `en/`.
- JS strings use `t('中文', 'English')` from `src/modules/i18n.js`.
- Chinese typography: Noto Serif SC (headlines, 300–500), system sans + Noto Sans SC (body, 1.8 line-height), Zhi Mang Xing only inside the calligraphy canvases. CJK fonts load from an async chunk (`src/fonts-cjk.js`) so ~300 KB of `@font-face` rules never block render; reveals wait for them.
- Line breaking follows 避头尾: SplitText gets `Intl.Segmenter` word boundaries with punctuation glued (`splitOpts`), per-character reveals use `splitCJK()`.

## Ink layer (v6)

Restraint is the rule: one calligraphic artefact per view, cinnabar only for the seal and a single mark.

- `ink/glyph.js`: real-time brush calligraphy (WebGL). Text is rasterised, then written along the reading order with stroke growth, 飞白 dry streaks and 洇 bleed. Used for 品 (studio), the 一笔墨 lab and the vertical 瓜熟蒂落 in the footer.
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
- **Fraunces** for display (opsz · SOFT · WONK);
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
