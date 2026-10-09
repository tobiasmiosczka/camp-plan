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

/**
 * Hält die zuletzt erzeugten Szenarien vor. Neu erzeugt wird nur, wenn sich Tage, Leiter, Städte oder die
 * einzeln aufgezählten Städte geändert haben – Änderungen an Positionen allein brauchen keine neuen Szenarien.
 */
export class ScenarioCache {

  private readonly ids = new WeakMap<City, number>();
  private nextId: number = 0;
  private signature: string = '';
  private contexts: Context[] = [];

  getContexts(contextRange: ContextRange, relevant: City[]): Context[] {
    const signature: string = JSON.stringify([
      contextRange.get(ContextType.LEADERS),
      contextRange.get(ContextType.DAYS),
      // Die Szenarien merken sich Städte als Objekte; eine gleich große, aber neue Stadt braucht neue Szenarien
      contextRange.getCities().map((city: City) => [this.id(city), city.getParticipants(), relevant.includes(city)]),
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.contexts = contextRange.getPermutations(relevant);
    }
    return this.contexts;
  }

  private id(city: City): number {
    let id: number | undefined = this.ids.get(city);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(city, id);
    }
    return id;
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
  private readonly participants: Range;
  private readonly leaders: Range;
  private readonly days: Range;
  /** Teilnehmer je Szenario, die auf zusammengefasste Städte entfallen. */
  private readonly rest: Int32Array;
  /** Wie viele echte Szenarien jedes zusammengefasste Szenario vertritt. */
  readonly weights: Float64Array;
  /** Anzahl aller echten Szenarien, als hätte man jede Stadt einzeln aufgezählt. */
  readonly scenarioCount: number;

  constructor(readonly contexts: Context[], readonly values: number[], contextRange: ContextRange,
              private readonly relevant: City[]) {
    for (const city of contextRange.getCities()) {
      this.ranges.set(city, {...city.getParticipants()});
    }
    this.participants = {...contextRange.get(ContextType.PARTICIPANTS)};
    this.leaders = {...contextRange.get(ContextType.LEADERS)};
    this.days = {...contextRange.get(ContextType.DAYS)};
    this.rest = Int32Array.from(contexts, (context: Context): number => relevant.reduce(
      (rest: number, city: City): number => rest - context.getParticipantsFrom(city), context.get(ContextType.PARTICIPANTS)));

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

  public isEmpty(): boolean {
    return this.contexts.length === 0;
  }

  public hasCity(city: City): boolean {
    return this.ranges.has(city);
  }

  /** Alle Werte, die die Dimension annehmen kann. */
  public domain(dimension: Dimension): number[] {
    if (dimension.kind === 'city') {
      return range(this.ranges.get(dimension.city) ?? {start: 0, end: 0, step: 1});
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
        visit(i, depth + 1, [...parts, this.valueOf(this.contexts[i], dimension)], taken);
      }
    };
    for (let i = 0; i < this.contexts.length; i++) {
      visit(i, 0, [], 0);
    }
    return groups;
  }

  private valueOf(context: Context, dimension: Dimension): number {
    return dimension.kind === 'city' ? context.getParticipantsFrom(dimension.city) : context.get(dimension.type);
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
