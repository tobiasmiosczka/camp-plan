import {ValueRange} from '../value-range';
import {Context, ContextRange, ContextType, PerCityModifier, Position, PositionModifier, Range} from './position';
import {Progress, PROGRESS_STEP} from './progress';

export interface Calculation {
  /** Überschuss je Szenario, in derselben Reihenfolge wie die Szenarien. */
  values: Float64Array;
  /** Ausgaben und Einnahmen je Szenario, für die Verteilung. */
  debitValues: Float64Array;
  creditValues: Float64Array;
  positionSums: Map<Position, ValueRange>;
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
}

/**
 * Rechnet Positionen über alle Szenarien.
 *
 * Positionen ohne Stadt-Faktor hängen nur von Teilnehmern, Leitern und Tagen ab. Dafür gibt es nur wenige
 * Kombinationen, also werden sie einmal in eine Tabelle gerechnet und je Szenario nur nachgeschlagen.
 * Einzeln je Szenario gerechnet werden nur Positionen mit „pro Teilnehmer aus …“.
 */
export function calculate(contexts: Context[], contextRange: ContextRange, debit: Position[], credit: Position[],
                          perParticipant: boolean, onProgress?: Progress): Calculation {
  const positions: Position[] = [...debit, ...credit];
  const byCity = (i: number): boolean =>
    positions[i].getModifiers().some((modifier: PositionModifier): boolean => modifier instanceof PerCityModifier);
  const indices: number[] = positions.map((_: Position, i: number): number => i);
  const sheet: Sheet = {
    positions,
    debitCount: debit.length,
    perParticipant,
    mins: positions.map((): number => Infinity),
    maxs: positions.map((): number => -Infinity),
  };

  const table: Table = tabulate(sheet, indices.filter((i: number): boolean => !byCity(i)), contextRange);
  const scenarios: Scenarios = evaluateScenarios(sheet, indices.filter(byCity), table, contexts, onProgress);

  const orEmpty = (range: ValueRange): ValueRange => contexts.length > 0 ? range : {min: 0, max: 0};
  return {
    values: scenarios.values,
    debitValues: scenarios.debitValues,
    creditValues: scenarios.creditValues,
    positionSums: new Map<Position, ValueRange>(positions.map((position: Position, i: number): [Position, ValueRange] =>
      [position, orEmpty({min: sheet.mins[i], max: sheet.maxs[i]})])),
    debitTotal: orEmpty(scenarios.debitTotal),
    creditTotal: orEmpty(scenarios.creditTotal),
    balance: orEmpty(scenarios.balance),
  };
}

/** Die Positionen einer Rechnung und die kleinste und größte Summe, die jede bisher erreicht hat. */
interface Sheet {
  /** Erst alle Ausgaben, dann alle Einnahmen. */
  positions: Position[];
  debitCount: number;
  perParticipant: boolean;
  mins: number[];
  maxs: number[];
}

/** Summe einer Position in einem Szenario; merkt sich dabei ihre Spanne. */
function sum(sheet: Sheet, i: number, context: Context, participants: number): number {
  const value: number = sheet.positions[i].getSum(context) / (sheet.perParticipant ? participants : 1);
  sheet.mins[i] = Math.min(sheet.mins[i], value);
  sheet.maxs[i] = Math.max(sheet.maxs[i], value);
  return value;
}

/** Ausgaben und Einnahmen je Kombination aus Teilnehmern, Leitern und Tagen. */
interface Table {
  debit: Float64Array;
  credit: Float64Array;
  index: (participants: number, leaders: number, days: number) => number;
}

/** Rechnet die Positionen in `tabled` für jede Kombination aus Teilnehmern, Leitern und Tagen. */
function tabulate(sheet: Sheet, tabled: number[], contextRange: ContextRange): Table {
  const participants: Range = contextRange.get(ContextType.PARTICIPANTS);
  const leaders: Range = contextRange.get(ContextType.LEADERS);
  const days: Range = contextRange.get(ContextType.DAYS);
  const leaderCount: number = leaders.end - leaders.start + 1;
  const dayCount: number = days.end - days.start + 1;
  const index = (p: number, l: number, d: number): number =>
    ((p - participants.start) * leaderCount + (l - leaders.start)) * dayCount + (d - days.start);
  const size: number = Math.max(0, participants.end - participants.start + 1) * leaderCount * dayCount;
  const table: Table = {debit: new Float64Array(size), credit: new Float64Array(size), index};
  for (let p = participants.start; p <= participants.end; p++) {
    for (let l = leaders.start; l <= leaders.end; l++) {
      for (let d = days.start; d <= days.end; d++) {
        const context = new Context(p, l, d);
        const at: number = index(p, l, d);
        for (const i of tabled) {
          const side: Float64Array = i < sheet.debitCount ? table.debit : table.credit;
          side[at] += sum(sheet, i, context, p);
        }
      }
    }
  }
  return table;
}

/** Überschuss, Ausgaben und Einnahmen je Szenario samt ihren Spannen. */
interface Scenarios {
  values: Float64Array;
  debitValues: Float64Array;
  creditValues: Float64Array;
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
}

/** Schlägt jedes Szenario in der Tabelle nach und rechnet nur die Positionen in `individual` einzeln dazu. */
function evaluateScenarios(sheet: Sheet, individual: number[], table: Table, contexts: Context[],
                           onProgress?: Progress): Scenarios {
  const scenarios: Scenarios = {
    values: new Float64Array(contexts.length),
    debitValues: new Float64Array(contexts.length),
    creditValues: new Float64Array(contexts.length),
    debitTotal: {min: Infinity, max: -Infinity},
    creditTotal: {min: Infinity, max: -Infinity},
    balance: {min: Infinity, max: -Infinity},
  };
  for (let c = 0; c < contexts.length; c++) {
    const context: Context = contexts[c];
    const p: number = context.get(ContextType.PARTICIPANTS);
    const at: number = table.index(p, context.get(ContextType.LEADERS), context.get(ContextType.DAYS));
    let debitSum: number = table.debit[at];
    let creditSum: number = table.credit[at];
    for (const i of individual) {
      if (i < sheet.debitCount) {
        debitSum += sum(sheet, i, context, p);
      } else {
        creditSum += sum(sheet, i, context, p);
      }
    }
    extend(scenarios.debitTotal, debitSum);
    extend(scenarios.creditTotal, creditSum);
    extend(scenarios.balance, creditSum - debitSum);
    scenarios.values[c] = creditSum - debitSum;
    scenarios.debitValues[c] = debitSum;
    scenarios.creditValues[c] = creditSum;
    if (onProgress && c % PROGRESS_STEP === 0) {
      onProgress(c / contexts.length);
    }
  }
  return scenarios;
}

function extend(range: ValueRange, value: number): void {
  range.min = Math.min(range.min, value);
  range.max = Math.max(range.max, value);
}
