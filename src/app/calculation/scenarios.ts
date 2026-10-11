import {ValueRange} from '../value-range';
import {City, Context, ContextRange, ContextType, Range, range} from './position';

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

/** Zahlenschlüssel statt String: Teilnehmer-, Leiter- und Tageszahlen bleiben weit unter 100.000. */
export function groupKey(parts: number[]): number {
  return parts.reduce((key: number, part: number): number => key * 100_000 + part, 0);
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

export function toColumns(contexts: Context[], cities: City[], relevant: City[]): ScenarioColumns {
  const indices: number[] = cities
    .map((city: City, i: number): number => relevant.includes(city) ? i : -1)
    .filter((i: number): boolean => i >= 0);
  return {
    relevant: indices,
    participants: Int32Array.from(contexts, (context: Context): number => context.get(ContextType.PARTICIPANTS)),
    leaders: Int32Array.from(contexts, (context: Context): number => context.get(ContextType.LEADERS)),
    days: Int32Array.from(contexts, (context: Context): number => context.get(ContextType.DAYS)),
    cities: indices.map((i: number): Int32Array =>
      Int32Array.from(contexts, (context: Context): number => context.getParticipantsFrom(cities[i]))),
  };
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
  private readonly relevant: City[];
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
    this.participants = {...contextRange.get(ContextType.PARTICIPANTS)};
    this.leaders = {...contextRange.get(ContextType.LEADERS)};
    this.days = {...contextRange.get(ContextType.DAYS)};
    this.rest = scenarios.participants.map((participants: number, i: number): number => scenarios.cities.reduce(
      (rest: number, column: Int32Array): number => rest - column[i], participants));

    const [restStart, ways] = this.distributions();
    this.weights = Float64Array.from(this.rest, (rest: number): number => ways[rest - restStart] ?? 0);
    this.scenarioCount = this.weights.reduce((sum: number, weight: number): number => sum + weight, 0);
  }

  /**
   * Auf wie viele Arten sich r Teilnehmer auf die zusammengefassten Städte verteilen lassen, für jedes mögliche r
   * (Faltung der Spannen, beginnend bei der Summe der Mindestwerte).
   */
  private distributions(): [number, number[]] {
    let start: number = 0;
    let ways: number[] = [1];
    this.ranges.forEach((participants: Range, city: City): void => {
      if (this.relevant.includes(city)) {
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
    const collapsed = (dimension: Dimension): boolean => dimension.kind === 'city' && !this.relevant.includes(dimension.city);
    const selected: City[] = dimensions
      .filter(collapsed)
      .map((dimension: Dimension): City => (dimension as { city: City }).city);
    // Spielraum der zusammengefassten Städte, die nicht ausgewählt sind
    let othersStart: number = 0;
    let othersEnd: number = 0;
    this.ranges.forEach((participants: Range, city: City): void => {
      if (!this.relevant.includes(city) && !selected.includes(city)) {
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
    const visit = (i: number, depth: number, parts: number[], taken: number): void => {
      if (depth === dimensions.length) {
        const left: number = this.rest[i] - taken;
        if (left >= othersStart && left <= othersEnd) {
          add(groupKey(parts), this.values[i]);
        }
        return;
      }
      const dimension: Dimension = dimensions[depth];
      if (collapsed(dimension)) {
        for (const value of candidates[depth]) {
          visit(i, depth + 1, [...parts, value], taken + value);
        }
      } else {
        visit(i, depth + 1, [...parts, columns[depth]![i]], taken);
      }
    };
    for (let i = 0; i < this.values.length; i++) {
      visit(i, 0, [], 0);
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
