import {ValueRange} from '../value-range';
import {Context, ContextRange, ContextType, PerCityModifier, Position, PositionModifier, Range} from './position';

export interface Calculation {
  /** Überschuss je Szenario, in derselben Reihenfolge wie die Szenarien. */
  values: number[];
  positionSums: Map<Position, ValueRange>;
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
}

/**
 * Rechnet Positionen über alle Szenarien und merkt sich das letzte Ergebnis.
 *
 * Positionen ohne Stadt-Faktor hängen nur von Teilnehmern, Leitern und Tagen ab. Dafür gibt es nur wenige
 * Kombinationen, also werden sie einmal in eine Tabelle gerechnet und je Szenario nur nachgeschlagen.
 * Einzeln je Szenario gerechnet werden nur Positionen mit „pro Teilnehmer aus …“.
 */
export class Calculator {

  private readonly ids = new WeakMap<object, number>();
  private nextId: number = 0;
  private signature: string = '';
  private result: Calculation | null = null;

  calculate(contexts: Context[], contextRange: ContextRange, debit: Position[], credit: Position[],
            perParticipant: boolean): Calculation {
    // Titel und Stadtnamen fließen nicht ein: Umbenennen braucht keine neue Rechnung
    const signature: string = JSON.stringify([
      this.id(contexts), perParticipant, debit.length,
      [...debit, ...credit].map((position: Position) => [this.id(position), position.getAmount(),
        position.getModifiers().map((modifier: PositionModifier): string | number =>
          modifier instanceof PerCityModifier ? this.id(modifier.getCity()) : modifier.getDescription())]),
    ]);
    if (signature !== this.signature || !this.result) {
      this.signature = signature;
      this.result = this.run(contexts, contextRange, debit, credit, perParticipant);
    }
    return this.result;
  }

  private run(contexts: Context[], contextRange: ContextRange, debit: Position[], credit: Position[],
              perParticipant: boolean): Calculation {
    const positions: Position[] = [...debit, ...credit];
    const isDebit = (i: number): boolean => i < debit.length;
    const byCity = (position: Position): boolean =>
      position.getModifiers().some((modifier: PositionModifier): boolean => modifier instanceof PerCityModifier);
    const mins: number[] = positions.map((): number => Infinity);
    const maxs: number[] = positions.map((): number => -Infinity);
    const track = (i: number, sum: number): void => {
      mins[i] = Math.min(mins[i], sum);
      maxs[i] = Math.max(maxs[i], sum);
    };

    // Tabelle über alle Kombinationen aus Teilnehmern, Leitern und Tagen
    const participants: Range = contextRange.get(ContextType.PARTICIPANTS);
    const leaders: Range = contextRange.get(ContextType.LEADERS);
    const days: Range = contextRange.get(ContextType.DAYS);
    const leaderCount: number = leaders.end - leaders.start + 1;
    const dayCount: number = days.end - days.start + 1;
    const index = (p: number, l: number, d: number): number =>
      ((p - participants.start) * leaderCount + (l - leaders.start)) * dayCount + (d - days.start);
    const size: number = Math.max(0, participants.end - participants.start + 1) * leaderCount * dayCount;
    const debitTable = new Float64Array(size);
    const creditTable = new Float64Array(size);
    const tabled: number[] = positions.map((_: Position, i: number): number => i).filter((i: number): boolean => !byCity(positions[i]));
    const individual: number[] = positions.map((_: Position, i: number): number => i).filter((i: number): boolean => byCity(positions[i]));
    for (let p = participants.start; p <= participants.end; p++) {
      for (let l = leaders.start; l <= leaders.end; l++) {
        for (let d = days.start; d <= days.end; d++) {
          const context = new Context(p, l, d);
          const divisor: number = perParticipant ? p : 1;
          for (const i of tabled) {
            const sum: number = positions[i].getSum(context) / divisor;
            track(i, sum);
            if (isDebit(i)) {
              debitTable[index(p, l, d)] += sum;
            } else {
              creditTable[index(p, l, d)] += sum;
            }
          }
        }
      }
    }

    const values: number[] = new Array<number>(contexts.length);
    const debitTotal: ValueRange = {min: Infinity, max: -Infinity};
    const creditTotal: ValueRange = {min: Infinity, max: -Infinity};
    const balance: ValueRange = {min: Infinity, max: -Infinity};
    const extend = (range: ValueRange, value: number): void => {
      range.min = Math.min(range.min, value);
      range.max = Math.max(range.max, value);
    };
    for (let c = 0; c < contexts.length; c++) {
      const context: Context = contexts[c];
      const p: number = context.get(ContextType.PARTICIPANTS);
      const at: number = index(p, context.get(ContextType.LEADERS), context.get(ContextType.DAYS));
      const divisor: number = perParticipant ? p : 1;
      let debitSum: number = debitTable[at];
      let creditSum: number = creditTable[at];
      for (const i of individual) {
        const sum: number = positions[i].getSum(context) / divisor;
        track(i, sum);
        if (isDebit(i)) {
          debitSum += sum;
        } else {
          creditSum += sum;
        }
      }
      extend(debitTotal, debitSum);
      extend(creditTotal, creditSum);
      extend(balance, creditSum - debitSum);
      values[c] = creditSum - debitSum;
    }

    const orEmpty = (range: ValueRange): ValueRange => contexts.length > 0 ? range : {min: 0, max: 0};
    return {
      values,
      positionSums: new Map<Position, ValueRange>(positions.map((position: Position, i: number): [Position, ValueRange] =>
        [position, orEmpty({min: mins[i], max: maxs[i]})])),
      debitTotal: orEmpty(debitTotal),
      creditTotal: orEmpty(creditTotal),
      balance: orEmpty(balance),
    };
  }

  private id(object: object): number {
    let id: number | undefined = this.ids.get(object);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(object, id);
    }
    return id;
  }
}
