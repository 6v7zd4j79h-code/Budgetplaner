// Zweiter Schritt beim Bon-Scan: Wenn die eingebaute Texterkennung Preise
// nicht lesen konnte oder die Summe nicht aufgeht, liest Claude die Fotos
// genau (Netlify-Funktion receipt-ai). Die Fotos werden vorher verkleinert,
// damit wenig Daten uebertragen werden.

const ENDPOINT = '/.netlify/functions/receipt-ai';
const MAX_SIDE = 1600;

async function shrink(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { media_type: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

// Liefert { shop, date, total, items: [{ name, amount, artNo? }] } oder wirft
// einen Fehler mit verstaendlicher Meldung.
export async function readWithClaude(files) {
  const images = [];
  for (const file of files) images.push(await shrink(file));
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });
  } catch {
    throw new Error('Keine Verbindung zum Internet.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Fehler ${response.status}`);
  return body;
}
