import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- constant path resolved from import.meta.url
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const appName = 'Dompet Orang Have';
const description =
  'Pelacak aset, cashflow, dan investasi lokal-first yang terenkripsi. Data tetap di perangkat Anda.';

const cspMeta = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.frankfurter.dev",
  "manifest-src 'self'",
  "worker-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

// frame-ancestors is ignored in a meta CSP; keep it in the HTTP header.
const cspHeader = `${cspMeta}; frame-ancestors 'none'`;

const securityHeaders = {
  'Content-Security-Policy': cspHeader,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: appName,
        short_name: 'Dompet',
        description,
        lang: 'id',
        dir: 'ltr',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        theme_color: '#09090b',
        background_color: '#09090b',
        categories: ['finance', 'productivity'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}'],
        globIgnores: ['**/data/gold-price.json'],
        runtimeCaching: [
          {
            // eslint-disable-next-line security/detect-unsafe-regex -- fixed literal path, bounded optional query
            urlPattern: /\/data\/gold-price\.json(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gold-price',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
    {
      name: 'production-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '<!-- CSP_META -->',
          `<meta http-equiv="Content-Security-Policy" content="${cspMeta}" />`,
        );
      },
    },
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: securityHeaders,
  },
});
