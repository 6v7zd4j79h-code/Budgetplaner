// Diagramme als schlichtes SVG - keine Bibliothek, funktioniert offline und
// passt sich ueber CSS-Variablen dem hellen und dunklen Modus an.

import { esc, eur } from './dom.js';

const R = 42;
const CIRC = 2 * Math.PI * R;

// parts: [{ id, label, value }] - id waehlt die Farbe (CSS-Klasse seg-<id>).
export function donut(parts, { center = '', caption = '', label = 'Diagramm' } = {}) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  let offset = 0;
  const gap = parts.length > 1 ? 1.2 : 0;
  const segments = total > 0
    ? parts.map((p) => {
      const length = (p.value / total) * CIRC;
      const visible = Math.max(0, length - gap);
      const seg = `<circle class="seg seg-${esc(p.id)}" r="${R}" cx="50" cy="50"
        stroke-dasharray="${visible.toFixed(2)} ${(CIRC - visible).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(p.label)}: ${eur(p.value)}</title></circle>`;
      offset += length;
      return seg;
    }).join('')
    : '';
  return `<figure class="donut" role="img" aria-label="${esc(label)}">
    <svg viewBox="0 0 100 100">
      <circle class="track" r="${R}" cx="50" cy="50"></circle>
      <g transform="rotate(-90 50 50)">${segments}</g>
    </svg>
    <figcaption><strong>${center}</strong>${caption ? `<span>${caption}</span>` : ''}</figcaption>
  </figure>`;
}

export function legend(parts) {
  const total = parts.reduce((sum, p) => sum + p.value, 0) || 1;
  return `<ul class="legend">${parts.map((p) => `
    <li><span class="dot seg-${esc(p.id)}"></span>
      <span class="legend-label">${esc(p.label)}</span>
      <span class="legend-value">${eur(p.value)}</span>
      <span class="legend-share">${Math.round((p.value / total) * 100)} %</span>
    </li>`).join('')}</ul>`;
}

// Fortschrittsbalken Ist gegen Budget. Ueberzogen faerbt sich rot.
export function meter(actual, budget, { invert = false } = {}) {
  const ratio = budget > 0 ? actual / budget : (actual > 0 ? 1.01 : 0);
  const width = Math.min(100, Math.max(0, ratio * 100));
  const over = !invert && ratio > 1;
  return `<div class="meter${over ? ' over' : ''}" role="progressbar"
    aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(width)}">
    <div style="width:${width.toFixed(1)}%"></div></div>`;
}
