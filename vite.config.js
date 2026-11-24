import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

const root = import.meta.dirname;

/**
 * HTML pipeline
 *  - <!-- @include name -->   → contents of partials/name.html
 *  - <!-- @page /path.html --> (in en/** stubs) → the shared bilingual source page
 *  - [[中文||English]]          → one language, picked by URL: /en/** is English, everything else Chinese
 *  - %PATH%                    → the page's language-neutral path (for the language switch / hreflang)
 *  - on English pages, internal page links (href="/…" without a file extension) get the /en prefix,
 *    unless the link carries hreflang (the language switch itself).
 */
const I18N = /\[\[([\s\S]*?)\|\|([\s\S]*?)\]\]/g;

function htmlPartials() {
  const dir = resolve(root, 'partials');
  const include = (html) =>
    html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name) => include(fs.readFileSync(resolve(dir, `${name}.html`), 'utf8')));
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => {
        const url = (ctx.originalUrl || ctx.path || '/').split('?')[0];
        const isEn = /^\/en(\/|$)/.test(url) || /^\/en\//.test(ctx.path || '');
        const stub = html.match(/<!--\s*@page\s+(\S+)\s*-->/);
        if (stub) html = fs.readFileSync(resolve(root, '.' + stub[1]), 'utf8');
        const neutral = (ctx.path || '/').replace(/^\/en(?=\/)/, '').replace(/index\.html$/, '');
        html = include(html)
          .replace(I18N, (_, zh, en) => (isEn ? en : zh))
          .replace(/%PATH%/g, neutral);
        if (isEn) {
          html = html.replace(/<a\b([^>]*?)\shref="(\/(?!en\/)[^"#.]*?(?:#[^"]*)?)"/g, (m, pre, href) =>
            /\bhreflang=/.test(m) || /\bhreflang=/.test(pre) ? m : `<a${pre} href="/en${href}"`
          );
        }
        return html;
      },
    },
    configureServer(server) {
      server.watcher.add(dir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(dir) || file.endsWith('.html')) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

// The sandbox preview is served through an HTTPS proxy
// (https://<port>-<sandbox>.e2b.app), so the dev server must listen on 0.0.0.0,
// accept any Host header and point the HMR websocket at the proxy's port 443.
const behindProxy = !!process.env.E2B_SANDBOX || !!process.env.E2B_SANDBOX_ID || process.env.PREVIEW_PROXY === '1';

export default defineConfig({
  plugins: [htmlPartials()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        beads: resolve(root, 'work/beads/index.html'),
        whisperleaf: resolve(root, 'work/whisperleaf/index.html'),
        en: resolve(root, 'en/index.html'),
        enBeads: resolve(root, 'en/work/beads/index.html'),
        enWhisperleaf: resolve(root, 'en/work/whisperleaf/index.html'),
        notFound: resolve(root, '404.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    hmr: behindProxy ? { clientPort: 443, protocol: 'wss' } : true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
});
