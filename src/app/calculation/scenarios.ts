import {ValueRange} from '../value-range';
import {City} from './city';
import {Context, ContextRange, ContextType} from './context';
import {Range, range} from './range';
import {Progress, PROGRESS_STEP} from './progress';

/** Eine Größe, nach der sich die Szenarien gegenüberstellen lassen. */
export type Dimension =
  | { kind: 'type', type: ContextType }
  | { kind: 'city', city: City };

export function sameDimension(a: Dimension | null, b: Dimension | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.kind === 'type' && b.kind === 'type' ? a.type === b.type
    : a.kind === 'city' && b.kind === 'city' && a.city === b.city;
}

const GROUP_KEY_BASE: number = 100_000;

/** Zahlenschlüssel statt String: Teilnehmer-, Leiter- und Tageszahlen bleiben weit unter 100.000. */
export function groupKey(parts: number[]): number {
  return parts.reduce((key: number, part: number): number => key * GROUP_KEY_BASE + part, 0);
}

/** Szenarien als Spalten statt als Objekte: lässt sich ohne Kopie aus dem Web Worker übergeben. */
export interface ScenarioColumns {
  /** Index der einzeln aufgezählten Städte in der Städteliste des Plans. */
  relevant: number[];
  participants: Int32Array;
  leaders: Int32Array;
  days: Int32Array;
  /** Teilnehmer je einzeln aufgezählter Stadt, in der Reihenfolge von `relevant`. */
  cities: Int32Array[];
}

/**
 * Alle Kombinationen aus Teilnehmern je Stadt, Leitern und Tagen, gleich als Spalten; Szenarien ohne Teilnehmer
 * entfallen. Die erste Stadt ändert sich am langsamsten, die Tage am schnellsten.
 *
 * Nur die Städte in `relevant` werden einzeln aufgezählt. Die übrigen wirken sich nur über die Gesamtzahl aus und
 * werden zu einer Spanne zusammengefasst – das ergibt dieselben Ergebnisse mit weit weniger Szenarien.
 */
export function enumerateScenarios(contextRange: ContextRange, relevant: City[] = contextRange.getCities(),
                                   onProgress?: Progress): ScenarioColumns {
  const cities: City[] = contextRange.getCities();
  const indices: number[] = cities
    .map((city: City, i: number): number => relevant.includes(city) ? i : -1)
    .filter((i: number): boolean => i >= 0);
  const rest: Range = {start: 0, end: 0};
  for (const city of cities) {
    if (!relevant.includes(city)) {
      rest.start += city.getParticipants().start;
      rest.end += city.getParticipants().end;
    }
  }
  // Je relevanter Stadt ein Zähler, dahinter einer für die zusammengefassten Städte
  const spans: Range[] = [...indices.map((i: number): Range => cities[i].getParticipants()), rest];
  const counts: number[] = spans.map((span: Range): number => span.start);
  const combinations: number = spans.reduce((product: number, span: Range): number =>
    product * (span.end - span.start + 1), 1);
  // Nur die allererste Kombination kann ganz ohne Teilnehmer sein
  const empty: number = counts.every((count: number): boolean => count === 0) ? 1 : 0;
  const leaders: number[] = range(contextRange.get(ContextType.LEADERS));
  const days: number[] = range(contextRange.get(ContextType.DAYS));
  const size: number = (combinations - empty) * leaders.length * days.length;
  const columns: ScenarioColumns = {
    relevant: indices,
    participants: new Int32Array(size),
    leaders: new Int32Array(size),
    days: new Int32Array(size),
    cities: indices.map((): Int32Array => new Int32Array(size)),
  };

  let i: number = 0;
  let nextReport: number = 0;
  for (let combination = 0; combination < combinations; combination++) {
    if (onProgress && i >= nextReport) {
      onProgress(i / size);
      nextReport += PROGRESS_STEP;
    }
    let total: number = 0;
    for (const count of counts) {
      total += count;
    }
    if (total > 0) {
      for (const l of leaders) {
        for (const d of days) {
          columns.participants[i] = total;
          columns.leaders[i] = l;
          columns.days[i] = d;
          for (let c = 0; c < indices.length; c++) {
            columns.cities[c][i] = counts[c];
          }
          i++;
        }
      }
    }
    // Weiterzählen wie ein Kilometerzähler, hinten am schnellsten
    for (let k = spans.length - 1; k >= 0; k--) {
      if (++counts[k] <= spans[k].end) {
        break;
      }
      counts[k] = spans[k].start;
    }
  }
  return columns;
}

/**
 * Ein Szenario aus den Spalten, das auf die Zeile {@link index} zeigt. Ein Objekt für alle Szenarien statt eines je
 * Szenario: Bei vielen Städten sind es Millionen.
 */
export class ColumnContext implements Context {

  index: number = 0;
  private readonly byCity: Map<City, Int32Array>;

  /** `cities` ist die Städteliste des Plans, auf die sich `columns.relevant` bezieht. */
  constructor(readonly columns: ScenarioColumns, cities: City[]) {
    this.byCity = new Map<City, Int32Array>(columns.relevant.map((cityIndex: number, c: number): [City, Int32Array] =>
      [cities[cityIndex], columns.cities[c]]));
  }

  get(type: ContextType): number {
    switch (type) {
      case ContextType.PARTICIPANTS:
        return this.columns.participants[this.index];
      case ContextType.LEADERS:
        return this.columns.leaders[this.index];
      case ContextType.DAYS:
        return this.columns.days[this.index];
    }
  }

  getParticipantsFrom(city: City): number {
    return this.byCity.get(city)?.[this.index] ?? 0;
  }
}

/**
 * Das Ergebnis jedes Szenarios, gruppierbar nach beliebigen Dimensionen ohne neue Rechnung.
 *
 * Städte, die nicht einzeln aufgezählt wurden, stecken nur in der Gesamtzahl. Für sie gilt ein Szenario für jede
 * Teilnehmerzahl k, bei der sich der Rest auf die übrigen zusammengefassten Städte verteilen lässt – das ist exakt
 * dieselbe Menge, die eine vollständige Aufzählung ergäbe.
 */
export class ScenarioResults {

  private readonly ranges = new Map<City, Range>();
  /** Die einzeln aufgezählten Städte, in der Reihenfolge von `scenarios.cities`. */
  private readonly relevant: City[];
  private readonly isRelevant: Set<City>;
  private readonly participants: Range;
  private readonly leaders: Range;
  private readonly days: Range;
  /** Teilnehmer je Szenario, die auf zusammengefasste Städte entfallen. */
  private readonly rest: Int32Array;
  /** Wie viele echte Szenarien jedes zusammengefasste Szenario vertritt. */
  readonly weights: Float64Array;
  /** Anzahl aller echten Szenarien, als hätte man jede Stadt einzeln aufgezählt. */
  readonly scenarioCount: number;

  /** Die Städte in `scenarios.relevant` werden über ihren Index in `contextRange` aufgelöst. */
  constructor(readonly scenarios: ScenarioColumns, readonly values: Float64Array, contextRange: ContextRange) {
    const cities: City[] = contextRange.getCities();
    for (const city of cities) {
      this.ranges.set(city, {...city.getParticipants()});
    }
    this.relevant = scenarios.relevant.map((i: number): City => cities[i]);
    this.isRelevant = new Set<City>(this.relevant);
    this.participants = {...contextRange.get(ContextType.PARTICIPANTS)};
    this.leaders = {...contextRange.get(ContextType.LEADERS)};
    this.days = {...contextRange.get(ContextType.DAYS)};
    // Schleifen statt map und reduce mit Funktion je Eintrag: Es sind oft Millionen Szenarien
    this.rest = scenarios.participants.slice();
    for (const column of scenarios.cities) {
      for (let i = 0; i < column.length; i++) {
        this.rest[i] -= column[i];
      }
    }

    const [restStart, ways] = this.distributions();
    this.weights = new Float64Array(this.rest.length);
    let scenarioCount: number = 0;
    for (let i = 0; i < this.rest.length; i++) {
      this.weights[i] = ways[this.rest[i] - restStart] ?? 0;
      scenarioCount += this.weights[i];
    }
    this.scenarioCount = scenarioCount;
  }

  /**
   * Auf wie viele Arten sich r Teilnehmer auf die zusammengefassten Städte verteilen lassen, für jedes mögliche r
   * (Faltung der Spannen, beginnend bei der Summe der Mindestwerte).
   */
  private distributions(): [number, number[]] {
    let start: number = 0;
    let ways: number[] = [1];
    this.ranges.forEach((participants: Range, city: City): void => {
      if (this.isRelevant.has(city)) {
        return;
      }
      const span: number = participants.end - participants.start;
      const next: number[] = new Array<number>(ways.length + span).fill(0);
      ways.forEach((count: number, i: number): void => {
        for (let k = 0; k <= span; k++) {
          next[i + k] += count;
        }
      });
      start += participants.start;
      ways = next;
    });
    return [start, ways];
  }

  /** Anzahl der berechneten Szenarien; zusammengefasste zählen einfach. */
  public get size(): number {
    return this.values.length;
  }

  /**
   * Durchschnitt über alle echten Szenarien; zusammengefasste zählen mit ihrem Gewicht. `values` steht in derselben
   * Reihenfolge wie die Szenarien, ohne Angabe der Überschuss.
   */
  public mean(values: ArrayLike<number> = this.values): number {
    let sum: number = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i] * this.weights[i];
    }
    return this.scenarioCount > 0 ? sum / this.scenarioCount : 0;
  }

  /** Anteil der echten Szenarien mit Defizit, 0 bis 1; zusammengefasste zählen mit ihrem Gewicht. */
  public deficitShare(): number {
    let deficit: number = 0;
    for (let i = 0; i < this.values.length; i++) {
      deficit += this.values[i] < 0 ? this.weights[i] : 0;
    }
    return this.scenarioCount > 0 ? deficit / this.scenarioCount : 0;
  }

  public isEmpty(): boolean {
    return this.values.length === 0;
  }

  public hasCity(city: City): boolean {
    return this.ranges.has(city);
  }

  /** Alle Werte, die die Dimension annehmen kann. */
  public domain(dimension: Dimension): number[] {
    if (dimension.kind === 'city') {
      return range(this.ranges.get(dimension.city) ?? {start: 0, end: 0});
    }
    switch (dimension.type) {
      case ContextType.PARTICIPANTS:
        return range(this.participants);
      case ContextType.LEADERS:
        return range(this.leaders);
      case ContextType.DAYS:
        return range(this.days);
    }
  }

  /** Minimum und Maximum je Wertekombination der Dimensionen, Schlüssel per {@link groupKey}. */
  public aggregate(dimensions: Dimension[]): Map<number, ValueRange> {
    const groups = new Map<number, ValueRange>();
    const collapsed = (dimension: Dimension): boolean => dimension.kind === 'city' && !this.isRelevant.has(dimension.city);
    const selected: City[] = dimensions
      .filter(collapsed)
      .map((dimension: Dimension): City => (dimension as { city: City }).city);
    // Spielraum der zusammengefassten Städte, die nicht ausgewählt sind
    let othersStart: number = 0;
    let othersEnd: number = 0;
    this.ranges.forEach((participants: Range, city: City): void => {
      if (!this.isRelevant.has(city) && !selected.includes(city)) {
        othersStart += participants.start;
        othersEnd += participants.end;
      }
    });
    const candidates: number[][] = dimensions.map((dimension: Dimension): number[] =>
      collapsed(dimension) ? this.domain(dimension) : []);
    const columns: (Int32Array | null)[] = dimensions.map((dimension: Dimension): Int32Array | null =>
      collapsed(dimension) ? null : this.column(dimension));

    const add = (key: number, value: number): void => {
      const group: ValueRange | undefined = groups.get(key);
      if (group) {
        group.min = Math.min(group.min, value);
        group.max = Math.max(group.max, value);
      } else {
        groups.set(key, {min: value, max: value});
      }
    };
    // Der Schlüssel wächst Stufe um Stufe wie in groupKey; so entsteht je Szenario kein Array
    const visit = (i: number, depth: number, key: number, taken: number): void => {
      if (depth === dimensions.length) {
        const left: number = this.rest[i] - taken;
        if (left >= othersStart && left <= othersEnd) {
          add(key, this.values[i]);
        }
        return;
      }
      const column: Int32Array | null = columns[depth];
      if (column === null) {
        for (const value of candidates[depth]) {
          visit(i, depth + 1, key * GROUP_KEY_BASE + value, taken + value);
        }
      } else {
        visit(i, depth + 1, key * GROUP_KEY_BASE + column[i], taken);
      }
    };
    for (let i = 0; i < this.values.length; i++) {
      visit(i, 0, 0, 0);
    }
    return groups;
  }

  /** Wert der Dimension je Szenario; nur für Städte, die einzeln aufgezählt wurden. */
  private column(dimension: Dimension): Int32Array {
    if (dimension.kind === 'city') {
      return this.scenarios.cities[this.relevant.indexOf(dimension.city)];
    }
    switch (dimension.type) {
      case ContextType.PARTICIPANTS:
        return this.scenarios.participants;
      case ContextType.LEADERS:
        return this.scenarios.leaders;
      case ContextType.DAYS:
        return this.scenarios.days;
    }
  }
}

export interface Histogram {
  /** Untergrenze der ersten Klasse; Klasse i umfasst [start + i·width, start + (i+1)·width). */
  start: number;
  width: number;
  counts: number[];
}

/**
 * Teilt gewichtete Werte in etwa `bins` Klassen mit runder Breite (1, 2, 2,5 oder 5 mal einer Zehnerpotenz).
 * Die Klassengrenzen liegen auf Vielfachen der Breite, also auch genau auf 0 €.
 */
export function histogram(values: ArrayLike<number>, weights: ArrayLike<number>, bins: number = 40): Histogram {
  let min: number = Infinity;
  let max: number = -Infinity;
  for (let i = 0; i < values.length; i++) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  if (values.length === 0) {
    return {start: 0, width: 1, counts: []};
  }
  const raw: number = (max - min) / bins;
  const power: number = raw > 0 ? 10 ** Math.floor(Math.log10(raw)) : 1;
  const width: number = raw > 0
    ? [1, 2, 2.5, 5, 10].map((factor: number): number => factor * power).find((step: number): boolean => step >= raw)!
    : Math.max(power, 0.01);
  const start: number = Math.floor(min / width) * width;
  const counts: number[] = new Array<number>(Math.floor((max - start) / width) + 1).fill(0);
  for (let i = 0; i < values.length; i++) {
    counts[Math.min(counts.length - 1, Math.floor((values[i] - start) / width))] += weights[i];
  }
  return {start, width, counts};
}
