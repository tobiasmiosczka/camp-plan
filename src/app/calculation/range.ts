/** Ganzzahliger Bereich, beide Grenzen eingeschlossen. */
export interface Range {
  readonly start: number;
  readonly end: number;
}

export function range(range: Range): number[] {
  const result: number[] = [];
  for (let v = range.start; v <= range.end; v++) {
    result.push(v);
  }
  return result;
}
