/**
 * Der Browser-Speicher, ohne dass ein Fehler die App aufhält: Im privaten Modus oder bei vollem Speicher geht nur
 * verloren, was über ein Neuladen hinaus bleiben sollte.
 */

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Dann gilt der Wert nur bis zum Neuladen.
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nichts gespeichert, nichts zu löschen.
  }
}
