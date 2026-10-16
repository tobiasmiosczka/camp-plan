import {EMPTY_VALUE_RANGE, ValueRange} from './value-range';
import {Context} from './context';
import {PositionId} from './id';
import {CityModifier, Modifier} from './modifiers';
import {Plan, rangeOf} from './plan';
import {Position, positionSum} from './position';
import {Progress, PROGRESS_STEP} from './progress';
import {Range} from './range';
import {cityColumn, missingCity, ScenarioColumns} from './enumerate';

export interface Calculation {
  /** Überschuss je Szenario, in derselben Reihenfolge wie die Szenarien. */
  values: Float64Array;
  /** Ausgaben und Einnahmen je Szenario, für die Verteilung. */
  debitValues: Float64Array;
  creditValues: Float64Array;
  /** Spanne je Position. */
  positionSums: Map<PositionId, ValueRange>;
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
}

/**
 * Rechnet die Positionen des Plans über alle Szenarien.
 *
 * Ohne „pro Teilnehmer aus …“ hängt eine Position nur von Teilnehmern, Leitern und Tagen ab. Dafür gibt es nur wenige
 * Kombinationen, also wird sie einmal in eine Tabelle gerechnet und je Szenario nur nachgeschlagen. Bei Positionen
 * mit Stadt-Faktor gilt das für alle übrigen Faktoren; die Stadt-Faktoren stehen am Ende und werden je Szenario aus
 * ihrer Spalte dazu multipliziert.
 */
export function calculate(scenarios: ScenarioColumns, plan: Plan, perParticipant: boolean,
                          onProgress?: Progress): Calculation {
  const grid: Grid = new Grid(plan);
  const entry = (position: Position): Entry => ({
    id: position.id,
    table: grid.tabulate(withoutCities(position), perParticipant),
    columns: cityModifiers(position).map(({city}: CityModifier): Int32Array => {
      const column: Int32Array | undefined = cityColumn(scenarios, city);
      if (column === undefined) {
        throw missingCity(city);
      }
      return column;
    }),
    sum: {min: Infinity, max: -Infinity},
  });
  const debit: Entry[] = plan.debit.map(entry);
  const credit: Entry[] = plan.credit.map(entry);
  const byCity = ({columns}: Entry): boolean => columns.length > 0;
  const tabled = ({columns}: Entry): boolean => columns.length === 0;

  // Positionen ohne Stadt zählen je Seite nur einmal je Kombination
  const tableSide = (side: Entry[]): Float64Array => {
    const total = new Float64Array(grid.size);
    for (const {table} of side.filter(tabled)) {
      table.forEach((value: number, at: number): void => {
        total[at]! += value;
      });
    }
    return total;
  };
  const debitTable: Float64Array = tableSide(debit);
  const creditTable: Float64Array = tableSide(credit);
  const individualDebit: Entry[] = debit.filter(byCity);
  const individualCredit: Entry[] = credit.filter(byCity);

  // Ab hier je Szenario: Die Indizes sind durch die Schleifen und das Raster gesichert, die Zugriffe ungeprüft (`!`)
  const count: number = scenarios.participants.length;
  const {participants, leaders, days} = scenarios;
  const totals: Totals = newTotals(count);
  const sideSum = (side: Entry[], c: number, at: number): number => {
    let sum: number = 0;
    for (const {table, columns, sum: range} of side) {
      let value: number = table[at]!;
      for (const column of columns) {
        value *= column[c]!;
      }
      sum += value;
      extend(range, value);
    }
    return sum;
  };
  for (let c = 0; c < count; c++) {
    const at: number = grid.index(participants[c]!, leaders[c]!, days[c]!);
    const debitSum: number = debitTable[at]! + sideSum(individualDebit, c, at);
    const creditSum: number = creditTable[at]! + sideSum(individualCredit, c, at);
    extend(totals.debitTotal, debitSum);
    extend(totals.creditTotal, creditSum);
    extend(totals.balance, creditSum - debitSum);
    totals.values[c] = creditSum - debitSum;
    totals.debitValues[c] = debitSum;
    totals.creditValues[c] = creditSum;
    if (onProgress && c % PROGRESS_STEP === 0) {
      onProgress(c / count);
    }
  }
  // Jede Kombination der Tabelle kommt in einem Szenario vor: Die Spanne steht schon in der Tabelle
  for (const {table, sum} of [...debit, ...credit].filter(tabled)) {
    table.forEach((value: number): void => extend(sum, value));
  }

  const orEmpty = (range: ValueRange): ValueRange => count > 0 ? range : {...EMPTY_VALUE_RANGE};
  return {
    values: totals.values,
    debitValues: totals.debitValues,
    creditValues: totals.creditValues,
    positionSums: new Map<PositionId, ValueRange>([...debit, ...credit]
      .map(({id, sum}: Entry): [PositionId, ValueRange] => [id, orEmpty(sum)])),
    debitTotal: orEmpty(totals.debitTotal),
    creditTotal: orEmpty(totals.creditTotal),
    balance: orEmpty(totals.balance),
  };
}

/**
 * Alle Kombinationen aus Teilnehmern, Leitern und Tagen, die in Szenarien des Plans vorkommen, je mit einer festen
 * Stelle in einer Tabelle.
 */
class Grid {

  private readonly participants: Range;
  private readonly leaderCount: number;
  private readonly dayCount: number;
  readonly size: number;

  constructor(private readonly plan: Plan) {
    this.participants = rangeOf(plan, 'participants');
    this.leaderCount = plan.leaders.end - plan.leaders.start + 1;
    this.dayCount = plan.days.end - plan.days.start + 1;
    // Ohne Teilnehmer endet die Spanne vor ihrem Anfang: dann gibt es keine Kombination
    this.size = Math.max(0, this.participants.end - this.participants.start + 1) * this.leaderCount * this.dayCount;
  }

  index(participants: number, leaders: number, days: number): number {
    return ((participants - this.participants.start) * this.leaderCount + (leaders - this.plan.leaders.start))
      * this.dayCount + (days - this.plan.days.start);
  }

  /** Summe der Position für jede Kombination; mit `perParticipant` geteilt durch die Teilnehmerzahl. */
  tabulate(position: Position, perParticipant: boolean): Float64Array {
    const table = new Float64Array(this.size);
    for (let participants = this.participants.start; participants <= this.participants.end; participants++) {
      for (let leaders = this.plan.leaders.start; leaders <= this.plan.leaders.end; leaders++) {
        for (let days = this.plan.days.start; days <= this.plan.days.end; days++) {
          const context: Context = {participants, leaders, days};
          table[this.index(participants, leaders, days)] =
            positionSum(position, context) / (perParticipant ? participants : 1);
        }
      }
    }
    return table;
  }
}

function cityModifiers(position: Position): CityModifier[] {
  return position.modifiers.filter((modifier: Modifier): modifier is CityModifier => modifier.kind === 'city');
}

/** Die Position ohne ihre Stadt-Faktoren; die werden je Szenario dazu multipliziert. */
function withoutCities(position: Position): Position {
  return {...position, modifiers: position.modifiers.filter((modifier: Modifier): boolean => modifier.kind !== 'city')};
}

/** Eine Position, für die Rechnung vorbereitet. */
interface Entry {
  id: PositionId;
  /** Summe ohne Stadt-Faktoren je Kombination des Rasters. */
  table: Float64Array;
  /** Teilnehmer je Szenario für jeden Stadt-Faktor; damit wird die Tabelle multipliziert. */
  columns: Int32Array[];
  /** Kleinste und größte Summe, die die Position erreicht. */
  sum: ValueRange;
}

/** Überschuss, Ausgaben und Einnahmen je Szenario samt ihren Spannen. */
interface Totals {
  values: Float64Array;
  debitValues: Float64Array;
  creditValues: Float64Array;
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
}

function newTotals(count: number): Totals {
  return {
    values: new Float64Array(count),
    debitValues: new Float64Array(count),
    creditValues: new Float64Array(count),
    debitTotal: {min: Infinity, max: -Infinity},
    creditTotal: {min: Infinity, max: -Infinity},
    balance: {min: Infinity, max: -Infinity},
  };
}

function extend(range: ValueRange, value: number): void {
  range.min = Math.min(range.min, value);
  range.max = Math.max(range.max, value);
}
