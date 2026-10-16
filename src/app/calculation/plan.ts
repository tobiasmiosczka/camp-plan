import {City, othersCity} from './city';
import {ContextType} from './context';
import {Position} from './position';
import {Range} from './range';

/** Kontoseite einer Position. */
export type Side = 'debit' | 'credit';

/**
 * Ein Plan. Unveränderlich: Jede Änderung ergibt einen neuen Plan, unveränderte Teile werden übernommen. Städte und
 * Positionen haben IDs, damit Faktoren, Ergebnisse und Tabellenzeilen sie über Änderungen hinweg wiederfinden.
 */
export interface Plan {
  /** Projektname, z. B. „Sommerlager 2027“; leer, wenn keiner vergeben ist. */
  readonly name: string;
  readonly days: Range;
  readonly leaders: Range;
  /** „Sonstige“ steht immer genau einmal am Ende, siehe {@link withOthersLast}. */
  readonly cities: readonly City[];
  readonly debit: readonly Position[];
  readonly credit: readonly Position[];
}

/** Spanne einer Größe; die Teilnehmer ergeben sich aus den Städten, ohne Teilnehmer wird nicht gerechnet. */
export function rangeOf(plan: Plan, type: ContextType): Range {
  if (type !== 'participants') {
    return plan[type];
  }
  let start: number = 0;
  let end: number = 0;
  for (const city of plan.cities) {
    start += city.participants.start;
    end += city.participants.end;
  }
  return {start: Math.max(1, start), end};
}

/** Die Städte mit genau einem „Sonstige“ am Ende; fehlt es, wird es ergänzt. */
export function withOthersLast(cities: readonly City[]): City[] {
  const others: City = cities.find((city: City): boolean => city.others) ?? othersCity();
  return [...cities.filter((city: City): boolean => !city.others), others];
}

/** Alle Positionen, erst Ausgaben, dann Einnahmen. */
export function positionsOf(plan: Plan): Position[] {
  return [...plan.debit, ...plan.credit];
}
