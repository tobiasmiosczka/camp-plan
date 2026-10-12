/** Meldet den erledigten Anteil einer Rechnung, von 0 bis 1. */
export type Progress = (share: number) => void;

/** Wie viele Szenarien eine Schleife zwischen zwei Fortschrittsmeldungen abarbeitet; selten genug, um nicht zu bremsen. */
export const PROGRESS_STEP: number = 1 << 14;

/** Bildet den Fortschritt einer Phase auf ihren Abschnitt `from` bis `to` der ganzen Rechnung ab. */
export function phase(progress: Progress | undefined, from: number, to: number): Progress | undefined {
  return progress && ((share: number): void => progress(from + share * (to - from)));
}
