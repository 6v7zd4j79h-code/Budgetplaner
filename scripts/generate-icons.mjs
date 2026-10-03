// Erzeugt die PWA-Icons neu. Wird nur gebraucht, wenn sich das Icon aendern
// soll - die fertigen PNGs liegen im Repository.
//
//   npm install --no-save sharp && node scripts/generate-icons.mjs

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

// Ringdiagramm als Motiv - dasselbe Bild wie die Uebersicht in der App.
function svg(size, { padding }) {
  const c = size / 2;
  const r = (size / 2) * (1 - padding) * 0.62;
  const stroke = r * 0.42;
  const circ = 2 * Math.PI * r;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c56fa8"/>
      <stop offset="55%" stop-color="#8e3b77"/>
      <stop offset="100%" stop-color="#4a1f40"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="${stroke}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${stroke}"
    stroke-dasharray="${(circ * 0.68).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>
</svg>`;
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, padding: 0.1 },
  { file: 'public/icons/icon-512.png', size: 512, padding: 0.1 },
  // Maskable-Icons werden beschnitten, deshalb mehr Luft am Rand.
  { file: 'public/icons/maskable-512.png', size: 512, padding: 0.3 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, padding: 0.1 },
];

for (const target of targets) {
  await sharp(Buffer.from(svg(target.size, { padding: target.padding })))
    .png()
    .toFile(target.file);
  console.log('geschrieben:', target.file);
}
