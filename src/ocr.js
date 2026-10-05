// Texterkennung fuer Kassenbons. Laeuft komplett im Browser (Tesseract,
// WebAssembly); das Foto verlaesst das Geraet nicht. Programm und deutsches
// Sprachpaket liegen unter /ocr auf der eigenen Adresse und werden erst
// beim ersten Scan geladen (danach aus dem Cache, auch offline).

let workerPromise = null;

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      return createWorker('deu', OEM.LSTM_ONLY, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
        gzip: true,
        logger: (m) => progressListener?.(m),
      });
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  progressListener = onProgress;
  return workerPromise;
}

let progressListener = null;

// Foto aufbereiten: richtig drehen, auf handliche Groesse bringen, Graustufen
// mit mehr Kontrast. Das macht die Erkennung auf Handyfotos deutlich besser.
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1800 / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    // Kontrast anheben: Thermopapier ist oft blass.
    const v = Math.max(0, Math.min(255, (gray - 128) * 1.5 + 140));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Liefert den erkannten Text. onProgress bekommt Werte von 0 bis 1.
export async function recognize(file, onProgress = () => {}) {
  onProgress(0.02, 'Bild wird vorbereitet');
  const canvas = await prepareImage(file);
  const worker = await getWorker((m) => {
    if (m.status === 'recognizing text') onProgress(0.3 + m.progress * 0.7, 'Text wird gelesen');
    else if (/load|initializ/.test(m.status)) onProgress(0.05 + (m.progress || 0) * 0.25, 'Texterkennung wird geladen');
  });
  // Seitenmodus 4: eine Spalte unterschiedlich grosser Zeilen - passt zu Bons.
  await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1', user_defined_dpi: '300' });
  const { data } = await worker.recognize(canvas);
  onProgress(1, 'Fertig');
  return data.text;
}
