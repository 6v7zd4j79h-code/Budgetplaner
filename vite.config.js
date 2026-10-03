import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Startfarbe der App: VITE_FARBE=blau (z. B. als Netlify-Umgebungsvariable)
// liefert Blau samt blauem App-Icon, ohne Angabe gilt Pflaume. In der App
// laesst sich die Farbe trotzdem jederzeit umstellen.
const blau = process.env.VITE_FARBE === 'blau';
const iconDir = blau ? 'icons-blau' : 'icons';
const themeColor = blau ? '#17325a' : '#6b2d5c';

export default defineConfig({
  plugins: [
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
        background_color: blau ? '#eef2f7' : '#f6eff4',
        theme_color: themeColor,
        icons: [
          { src: `${iconDir}/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${iconDir}/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${iconDir}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
    }),
  ],
});
