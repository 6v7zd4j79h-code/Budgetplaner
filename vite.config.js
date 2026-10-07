import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { handle, memoryStore } from './server/vault-core.js';

// Startfarbe der App: VITE_FARBE=blau oder grau (z. B. als Netlify-
// Umgebungsvariable) liefert die Farbe samt passendem App-Icon, ohne Angabe
// gilt Pflaume. In der App
// laesst sich die Farbe trotzdem jederzeit umstellen.
const FARBEN = {
  pflaume: { iconDir: 'icons', themeColor: '#6b2d5c', background: '#f6eff4' },
  blau: { iconDir: 'icons-blau', themeColor: '#17325a', background: '#eef2f7' },
  grau: { iconDir: 'icons-grau', themeColor: '#2f3437', background: '#eceef0' },
};
const farbe = FARBEN[process.env.VITE_FARBE] || FARBEN.pflaume;
const { iconDir, themeColor } = farbe;

// Beim Entwickeln (npm run dev) beantwortet Vite die Anfragen an die
// Netlify-Funktion selbst - mit einer Ablage im Arbeitsspeicher, die beim
// Neustart leer ist. Online uebernimmt das netlify/functions/vault.mjs.
function abgleichImDev() {
  const store = memoryStore();
  return {
    name: 'abgleich-im-dev',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions/vault', (req, res) => {
        let text = '';
        req.on('data', (chunk) => { text += chunk; });
        req.on('end', async () => {
          let body = null;
          try { body = JSON.parse(text); } catch { /* bleibt null */ }
          const result = await handle(store, body);
          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result.body));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    abgleichImDev(),
    {
      // Statusleistenfarbe und Home-Bildschirm-Icon passend zur Startfarbe.
      name: 'farbe-im-html',
      transformIndexHtml: (html) => html
        .replace('content="#6b2d5c"', `content="${themeColor}"`)
        .replace('/icons/apple-touch-icon.png', `/${iconDir}/apple-touch-icon.png`),
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [`${iconDir}/icon-192.png`, `${iconDir}/icon-512.png`, `${iconDir}/maskable-512.png`, `${iconDir}/apple-touch-icon.png`],
      manifest: {
        name: 'Budgetplaner',
        short_name: 'Budget',
        description: 'Persönlicher Budgetplaner – Einnahmen, Rechnungen, Ausgaben, Abos und Sparziele.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: farbe.background,
        theme_color: themeColor,
        icons: [
          { src: `${iconDir}/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${iconDir}/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${iconDir}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Die Texterkennung (rund 6 MB) nicht beim ersten Start laden, sondern
        // erst beim ersten Bon-Scan - danach liegt sie im Cache und geht offline.
        globIgnores: ['ocr/**'],
        runtimeCaching: [
          {
            urlPattern: /\/ocr\//,
            handler: 'CacheFirst',
            options: { cacheName: 'texterkennung', expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
});
