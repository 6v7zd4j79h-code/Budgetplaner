// Digitale Kassenbons (eBon als PDF, z. B. aus der EDEKA-, REWE- oder
// Lidl-Plus-App): Der Text steckt schon im PDF und wird direkt gelesen -
// ohne Texterkennung, also ohne Lesefehler. Laeuft komplett im Browser.

import { linesFromItems } from './pdf-lines.js';

let pdfjsPromise = null;

async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = workerSrc;
      return lib;
    })();
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

// Liefert den Text aller Seiten, Zeile fuer Zeile wie auf dem Bon.
export async function pdfText(file, onProgress = () => {}) {
  onProgress(0.1, 'PDF wird geöffnet');
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(linesFromItems(content.items).join('\n'));
    onProgress(0.1 + (0.9 * n) / doc.numPages, 'PDF wird gelesen');
  }
  await doc.destroy();
  return pages.join('\n');
}
