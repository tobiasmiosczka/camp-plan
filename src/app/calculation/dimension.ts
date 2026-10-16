import {ContextType} from './context';
import {CityId} from './id';

/** Die Teilnehmer aus einer Stadt als Größe. */
export interface CityDimension {
  kind: 'city';
  city: CityId;
}

/** Eine Größe, nach der sich die Szenarien gegenüberstellen lassen. */
export type Dimension = { kind: 'type', type: ContextType } | CityDimension;

export function sameDimension(a: Dimension | null, b: Dimension | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.kind === 'type' && b.kind === 'type' ? a.type === b.type
    : a.kind === 'city' && b.kind === 'city' && a.city === b.city;
}

/** Stellenwert je Teil eines {@link groupKey}. */
export const GROUP_KEY_BASE: number = 100_000;

/** Zahlenschlüssel statt String: Teilnehmer-, Leiter- und Tageszahlen bleiben weit unter 100.000. */
export function groupKey(parts: number[]): number {
  return parts.reduce((key: number, part: number): number => key * GROUP_KEY_BASE + part, 0);
}
