// Erzeugt die PWA-Icons neu. Wird nur gebraucht, wenn sich das Icon aendern
// soll - die fertigen PNGs liegen im Repository.
//
//   npm install --no-save sharp && node scripts/generate-icons.mjs

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';


// Ringdiagramm als Motiv - dasselbe Bild wie die Uebersicht in der App.
function svg(size, { padding, colors }) {
  const c = size / 2;
  const r = (size / 2) * (1 - padding) * 0.62;
  const stroke = r * 0.42;
  const circ = 2 * Math.PI * r;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors[0]}"/>
      <stop offset="55%" stop-color="${colors[1]}"/>
      <stop offset="100%" stop-color="${colors[2]}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="${stroke}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${stroke}"
    stroke-dasharray="${(circ * 0.68).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>
</svg>`;
}

const variants = [
  { dir: 'public/icons', colors: ['#c56fa8', '#8e3b77', '#4a1f40'] },
  { dir: 'public/icons-blau', colors: ['#5b8fd6', '#1f4e8c', '#0f2342'] },
];
const sizes = [
  { name: 'icon-192.png', size: 192, padding: 0.1 },
  { name: 'icon-512.png', size: 512, padding: 0.1 },
  // Maskable-Icons werden beschnitten, deshalb mehr Luft am Rand.
  { name: 'maskable-512.png', size: 512, padding: 0.3 },
  { name: 'apple-touch-icon.png', size: 180, padding: 0.1 },
];

for (const variant of variants) {
  mkdirSync(variant.dir, { recursive: true });
  for (const target of sizes) {
    const file = `${variant.dir}/${target.name}`;
    await sharp(Buffer.from(svg(target.size, { padding: target.padding, colors: variant.colors })))
      .png()
      .toFile(file);
    console.log('geschrieben:', file);
  }
}
