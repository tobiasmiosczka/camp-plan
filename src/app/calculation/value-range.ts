export interface ValueRange {
  min: number;
  max: number;
}

/** Spanne ohne Werte, etwa vor der ersten Rechnung; zum Anzeigen, nicht zum Ändern. */
export const EMPTY_VALUE_RANGE: Readonly<ValueRange> = {min: 0, max: 0};
