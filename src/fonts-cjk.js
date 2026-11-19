/**
 * CJK webfonts, loaded off the critical path.
 * Each family ships ~100 unicode-range subsets (~300 KB of @font-face rules in
 * total), so they live in their own async chunk instead of the render-blocking
 * stylesheet. The browser still only downloads the subsets a page actually uses.
 */
import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource/zhi-mang-xing';
