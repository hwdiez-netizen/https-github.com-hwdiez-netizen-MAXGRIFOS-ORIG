import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'esm.sh' || url.hostname === 'cdn.jsdelivr.net',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cdn-wasm-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /.*\.wasm$/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'wasm-cache' },
          },
        ],
      },
    }),
  ],
  define: {
    __APP_BUILD__: JSON.stringify(gitHash),
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
});
