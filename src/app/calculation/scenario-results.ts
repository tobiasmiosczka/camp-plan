import {ValueRange} from './value-range';
import {CityDimension, Dimension, GROUP_KEY_BASE} from './dimension';
import {cityColumn, missingCity, ScenarioColumns} from './enumerate';
import {CityId} from './id';
import {Plan, rangeOf} from './plan';
import {Range, range} from './range';

// In den Schleifen über Szenarien und Spalten sichern die Schleifengrenzen die Indizes; Zugriffe sind dort ungeprüft
// (`!`), weil eine Prüfung je Szenario die Rechnung bremsen würde.

/**
 * Das Ergebnis jedes Szenarios, gruppierbar nach beliebigen Dimensionen ohne neue Rechnung.
 *
 * Städte, die nicht einzeln aufgezählt wurden, stecken nur in der Gesamtzahl. Für sie gilt ein Szenario für jede
 * Teilnehmerzahl k, bei der sich der Rest auf die übrigen zusammengefassten Städte verteilen lässt – das ist exakt
 * dieselbe Menge, die eine vollständige Aufzählung ergäbe.
 */
export class ScenarioResults {

  /** Teilnehmer je Stadt-ID. */
  private readonly ranges = new Map<CityId, Range>();
  private readonly isRelevant: Set<CityId>;
  private readonly participants: Range;
  private readonly leaders: Range;
  private readonly days: Range;
  /** Teilnehmer je Szenario, die auf zusammengefasste Städte entfallen. */
  private readonly rest: Int32Array;
  /** Wie viele echte Szenarien jedes zusammengefasste Szenario vertritt. */
  readonly weights: Float64Array;
  /** Anzahl aller echten Szenarien, als hätte man jede Stadt einzeln aufgezählt. */
  readonly scenarioCount: number;

  /** `plan` ist der Plan, für den gerechnet wurde. */
  constructor(readonly scenarios: ScenarioColumns, readonly values: Float64Array, plan: Plan) {
    for (const city of plan.cities) {
      this.ranges.set(city.id, city.participants);
    }
    this.isRelevant = new Set<CityId>(scenarios.relevant);
    this.participants = rangeOf(plan, 'participants');
    this.leaders = plan.leaders;
    this.days = plan.days;
    // Schleifen statt map und reduce mit Funktion je Eintrag: Es sind oft Millionen Szenarien
    this.rest = scenarios.participants.slice();
    for (const column of scenarios.cities) {
      for (let i = 0; i < column.length; i++) {
        this.rest[i]! -= column[i]!;
      }
    }

    const [restStart, ways] = this.distributions();
    this.weights = new Float64Array(this.rest.length);
    let scenarioCount: number = 0;
    for (let i = 0; i < this.rest.length; i++) {
      const weight: number = ways[this.rest[i]! - restStart] ?? 0;
      this.weights[i] = weight;
      scenarioCount += weight;
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
    this.ranges.forEach((participants: Range, city: CityId): void => {
      if (this.isRelevant.has(city)) {
        return;
      }
      const span: number = participants.end - participants.start;
      const next: number[] = new Array<number>(ways.length + span).fill(0);
      ways.forEach((count: number, i: number): void => {
        for (let k = 0; k <= span; k++) {
          next[i + k]! += count;
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
      sum += values[i]! * this.weights[i]!;
    }
    return this.scenarioCount > 0 ? sum / this.scenarioCount : 0;
  }

  /** Anteil der echten Szenarien mit Defizit, 0 bis 1; zusammengefasste zählen mit ihrem Gewicht. */
  public deficitShare(): number {
    let deficit: number = 0;
    for (let i = 0; i < this.values.length; i++) {
      deficit += this.values[i]! < 0 ? this.weights[i]! : 0;
    }
    return this.scenarioCount > 0 ? deficit / this.scenarioCount : 0;
  }

  public isEmpty(): boolean {
    return this.values.length === 0;
  }

  /** Alle Werte, die die Dimension annehmen kann. */
  public domain(dimension: Dimension): number[] {
    if (dimension.kind === 'city') {
      return range(this.ranges.get(dimension.city) ?? {start: 0, end: 0});
    }
    switch (dimension.type) {
      case 'participants':
        return range(this.participants);
      case 'leaders':
        return range(this.leaders);
      case 'days':
        return range(this.days);
    }
  }

  /** Minimum und Maximum je Wertekombination der Dimensionen, Schlüssel per {@link groupKey}. */
  public aggregate(dimensions: Dimension[]): Map<number, ValueRange> {
    const groups = new Map<number, ValueRange>();
    const collapsed = (dimension: Dimension): dimension is CityDimension =>
      dimension.kind === 'city' && !this.isRelevant.has(dimension.city);
    const selected: CityId[] = dimensions
      .filter(collapsed)
      .map((dimension: CityDimension): CityId => dimension.city);
    // Spielraum der zusammengefassten Städte, die nicht ausgewählt sind
    let othersStart: number = 0;
    let othersEnd: number = 0;
    this.ranges.forEach((participants: Range, city: CityId): void => {
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
        const left: number = this.rest[i]! - taken;
        if (left >= othersStart && left <= othersEnd) {
          add(key, this.values[i]!);
        }
        return;
      }
      const column: Int32Array | null = columns[depth]!;
      if (column === null) {
        for (const value of candidates[depth]!) {
          visit(i, depth + 1, key * GROUP_KEY_BASE + value, taken + value);
        }
      } else {
        visit(i, depth + 1, key * GROUP_KEY_BASE + column[i]!, taken);
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
      const column: Int32Array | undefined = cityColumn(this.scenarios, dimension.city);
      if (column === undefined) {
        throw missingCity(dimension.city);
      }
      return column;
    }
    switch (dimension.type) {
      case 'participants':
        return this.scenarios.participants;
      case 'leaders':
        return this.scenarios.leaders;
      case 'days':
        return this.scenarios.days;
    }
  }
}
