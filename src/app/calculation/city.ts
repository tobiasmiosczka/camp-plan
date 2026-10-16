import {newId} from './id';
import {Range} from './range';

/** Eine Stadt, aus der Teilnehmende kommen, mit geschätzter Teilnehmerzahl. */
export interface City {
  readonly id: string;
  readonly name: string;
  readonly participants: Range;
  /** Sammelposten für alle Teilnehmenden ohne eigene Stadt; gibt es in jedem Plan genau einmal, als letzte Stadt. */
  readonly others: boolean;
}

/** Name von „Sonstige“ in Dateien; angezeigt wird der Name der gewählten Sprache. */
export const OTHERS_NAME = 'Sonstige';

export function newCity(name: string, participants: Range): City {
  return {id: newId(), name, participants, others: false};
}

export function othersCity(participants: Range = {start: 0, end: 0}): City {
  return {id: newId(), name: OTHERS_NAME, participants, others: true};
}
