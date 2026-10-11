// Textstuecke eines PDFs (pdf.js getTextContent) zu Zeilen zusammensetzen:
// gleiche Hoehe = gleiche Zeile, von oben nach unten, links nach rechts.
// Eigene Datei ohne pdf.js, damit es sich ohne Browser testen laesst.

export function linesFromItems(items, tolerance = 2) {
  const rows = [];
  for (const item of items || []) {
    const text = String(item.str ?? '');
    if (!text.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= tolerance);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, text });
  }
  return rows
    .sort((a, b) => b.y - a.y) // PDF zaehlt von unten nach oben
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.text.trim()).join('  ').trim());
}

export function isPdf(file) {
  return file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
}
