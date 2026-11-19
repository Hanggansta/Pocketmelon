# v9 notes: from 口袋瓜 the fruit to 口袋瓜 the studio

## What the brief said
- Keep the v8 hero film, but make the 口袋瓜 lettering more artistic.
- No round-ball cursor.
- Two cases straight after the hero, 口袋瓜拼豆 first, at SOTY/SOTM level.
- A far more high-end logo.
- The name is a melon, and beads are one product. Neither is the motif. The motif is digital capability.
- No more ink. Remove the footer 瓜熟蒂落.
- Only 墨与石 keeps guofeng. Everything else should be non-guofeng and show current technology.

## References that shaped it
- **Lando Norris (SOTY 2025, OFF+BRAND) and Lusion:** a near-black canvas, one acid signal colour, mono utility text, and big display type.
- **Codrops WebGL portfolio studies (2024–2025):** quads that bend with scroll or cursor velocity, RGB split, and gallery transitions driven by velocity.
- **Cursor patterns (Obys, Mutt, Immersive Garden):** the cursor locks onto and frames its target, with a contextual label. We use brackets rather than a dot and ring.
- **The SOTM portfolio pattern:** show the work *running*, not a screenshot of it.

## Decisions
1. **The 口 viewfinder.** 口 is literally a frame: logo, favicon, transition seal, cursor and showcase windows are all four corner brackets plus a focus pip. It is a camera or editor UI gesture, owned by the name, and not a fruit.
2. **Engines, not posters.** Each case opens on its product's real algorithm in a fragment shader:
   - Beads: OKLab nearest-colour quantisation against 48 real bead colours, then fused-bead lighting.
   - Whisperleaf: CEFR grading, a magnifier lens, and threaded occurrences with a gloss card.

   Scroll scrubs the algorithm, and the HUD prints real numbers (grid, bead count, colours used; words, lemmas, graded).
3. **Capabilities, not crops.** "我们种什么" became "能力 · 让想法跑起来". Pixel icons were replaced with live hairline specimens (journey graph, easing curve, reflowing 12-column grid, flow field), each bent by the pointer.
4. **Palette.** The dark theme moved from rind green to neutral `#0B0C0E` with `#D4FF3F` as the single signal.
5. **Removed:** the pixel cat (logo, loader, Beads hero, inquiry), the bead-board mascot demo, the pixel icons and pixel text, Pixelify Sans, the footer calligraphy and landscape, melon copy (sweet spot, ripe, bite, grow, fresh from the vine), and the mascot and watermelon photography.

## Verification
- Headless renders (SwiftShader) of the hero (motion and reduced), every showcase stage at several scroll positions, desktop and mobile, the capabilities, the work index, and both case pages in zh and en.
- `npx vite build` is clean.
- The work-index preview shader is compile-checked in a harness (headless Chrome reports no fine pointer, so the hover itself can't be rendered there).
