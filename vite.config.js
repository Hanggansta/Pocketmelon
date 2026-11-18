import { defineConfig } from 'vite';

// The sandbox preview is served through an HTTPS proxy
// (https://<port>-<sandbox>.e2b.app), so the dev server must:
//  - listen on 0.0.0.0
//  - accept any Host header
//  - point the HMR websocket at the proxy's port 443 (wss)
const behindProxy = !!process.env.E2B_SANDBOX || !!process.env.E2B_SANDBOX_ID || process.env.PREVIEW_PROXY === '1';

export default defineConfig({
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
