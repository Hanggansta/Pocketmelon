/**
 * CJK webfonts, loaded off the critical path.
 * Each family ships ~100 unicode-range subsets (~300 KB of @font-face rules in
 * total), so they live in their own async chunk instead of the render-blocking
 * stylesheet. The browser still only downloads the subsets a page actually uses.
 */
import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/noto-sans-sc';
// 京華老宋体 (KingHwa OldSong): the display face, a letterpress Song with real ink traps
import '@chinese-fonts/jhlst/dist/京華老宋体v2_002/result.css';
