let last: number = 0;

/**
 * Eine neue ID für Städte und Positionen, eindeutig, solange die App läuft. Gespeichert werden IDs nicht: Beim Laden
 * bekommt jedes Element eine neue.
 */
export function newId(): string {
  return `${++last}`;
}
