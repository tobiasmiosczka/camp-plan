import {Context} from './context';
import {newId} from './id';
import {compareModifiers, factor, Modifier} from './modifiers';

/** Ein Posten auf der Ausgaben- oder Einnahmenseite: Betrag mal alle Faktoren. */
export interface Position {
  readonly id: string;
  readonly title: string;
  readonly amount: number;
  /** Sortiert nach {@link compareModifiers}; „pro Teilnehmer aus …“ steht immer am Ende. */
  readonly modifiers: readonly Modifier[];
}

export function newPosition(title: string, amount: number, modifiers: readonly Modifier[] = []): Position {
  return {id: newId(), title, amount, modifiers: sortModifiers(modifiers)};
}

export function sortModifiers(modifiers: readonly Modifier[]): Modifier[] {
  return [...modifiers].sort(compareModifiers);
}

export function positionSum(position: Position, context: Context): number {
  let sum: number = position.amount;
  for (const modifier of position.modifiers) {
    sum = factor(modifier, context) * sum;
  }
  return sum;
}
