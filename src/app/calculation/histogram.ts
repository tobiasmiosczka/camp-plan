// In den Schleifen über Szenarien und Spalten sichern die Schleifengrenzen die Indizes; Zugriffe sind dort ungeprüft
// (`!`), weil eine Prüfung je Szenario die Rechnung bremsen würde.

export interface Histogram {
  /** Untergrenze der ersten Klasse; Klasse i umfasst [start + i·width, start + (i+1)·width). */
  start: number;
  width: number;
  counts: number[];
}

/**
 * Teilt gewichtete Werte in etwa `bins` Klassen mit runder Breite (1, 2, 2,5 oder 5 mal einer Zehnerpotenz).
 * Die Klassengrenzen liegen auf Vielfachen der Breite, also auch genau auf 0 €.
 */
export function histogram(values: ArrayLike<number>, weights: ArrayLike<number>, bins: number = 40): Histogram {
  let min: number = Infinity;
  let max: number = -Infinity;
  for (let i = 0; i < values.length; i++) {
    min = Math.min(min, values[i]!);
    max = Math.max(max, values[i]!);
  }
  if (values.length === 0) {
    return {start: 0, width: 1, counts: []};
  }
  const raw: number = (max - min) / bins;
  const power: number = raw > 0 ? 10 ** Math.floor(Math.log10(raw)) : 1;
  const width: number = raw > 0
    ? [1, 2, 2.5, 5, 10].map((factor: number): number => factor * power).find((step: number): boolean => step >= raw)!
    : Math.max(power, 0.01);
  const start: number = Math.floor(min / width) * width;
  const counts: number[] = new Array<number>(Math.floor((max - start) / width) + 1).fill(0);
  for (let i = 0; i < values.length; i++) {
    counts[Math.min(counts.length - 1, Math.floor((values[i]! - start) / width))]! += weights[i]!;
  }
  return {start, width, counts};
}
