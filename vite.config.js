import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

const root = import.meta.dirname;

/** <!-- @include name --> → contents of partials/name.html */
function htmlPartials() {
  const dir = resolve(root, 'partials');
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name) => fs.readFileSync(resolve(dir, `${name}.html`), 'utf8')),
    },
    configureServer(server) {
      server.watcher.add(dir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(dir)) server.ws.send({ type: 'full-reload' });
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
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        beads: resolve(root, 'work/beads/index.html'),
        whisperleaf: resolve(root, 'work/whisperleaf/index.html'),
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
