// Farbschema: Pflaume, Blau oder Grau (sachlich, Buero-Stil). Die Wahl gilt pro Geraet und liegt
// getrennt von den Budgetdaten, damit eine Sicherung sie nicht mitnimmt.
// Ohne eigene Wahl gilt die Vorgabe aus dem Build (VITE_FARBE).

export const PALETTES = [
  { id: 'pflaume', label: 'Pflaume', themeColor: '#6b2d5c', swatch: ['#6b2d5c', '#d0739f', '#c39424'] },
  { id: 'blau', label: 'Blau', themeColor: '#17325a', swatch: ['#17325a', '#3a9bbf', '#c39424'] },
  { id: 'grau', label: 'Grau', themeColor: '#2f3437', swatch: ['#2f3437', '#44546a', '#9aa3ab'] },
];

const STORAGE_KEY = 'budgetplaner.palette';

function buildDefault() {
  const fromBuild = import.meta.env?.VITE_FARBE;
  return PALETTES.some((p) => p.id === fromBuild) ? fromBuild : 'pflaume';
}

export function currentPalette() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (PALETTES.some((p) => p.id === stored)) return stored;
  } catch {
    // ohne Speicher gilt die Vorgabe
  }
  return buildDefault();
}

export function applyPalette(id = currentPalette()) {
  const palette = PALETTES.find((p) => p.id === id) || PALETTES[0];
  document.documentElement.dataset.palette = palette.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.themeColor);
}

export function setPalette(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Wahl gilt dann nur bis zum Neuladen
  }
  applyPalette(id);
}
