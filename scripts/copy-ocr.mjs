// Kopiert die Texterkennung (Tesseract) samt deutschem Sprachpaket nach
// public/ocr, damit die App sie von der eigenen Adresse laedt - kein
// fremder Server, und nach dem ersten Scan auch offline verfuegbar.
// Laeuft automatisch vor `npm run dev` und `npm run build`.

import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const target = 'public/ocr';
mkdirSync(target, { recursive: true });

const tesseractDist = join(dirname(require.resolve('tesseract.js/package.json')), 'dist');
const coreDir = dirname(require.resolve('tesseract.js-core/package.json'));
const langDir = join(dirname(require.resolve('@tesseract.js-data/deu/package.json')), '4.0.0_best_int');

const files = [
  [join(tesseractDist, 'worker.min.js'), 'worker.min.js'],
  // Nur LSTM - je nach Geraet waehlt Tesseract die passende Variante.
  [join(coreDir, 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(coreDir, 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(coreDir, 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  [join(langDir, 'deu.traineddata.gz'), 'deu.traineddata.gz'],
];

for (const [from, name] of files) copyFileSync(from, join(target, name));
console.log(`Texterkennung nach ${target} kopiert (${files.length} Dateien).`);
