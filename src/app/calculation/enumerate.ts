import {City} from './city';
import {CityId} from './id';
import {Plan} from './plan';
import {Progress, PROGRESS_STEP} from './progress';
import {Range, range} from './range';

/** Szenarien als Spalten statt als Objekte: lässt sich ohne Kopie aus dem Web Worker übergeben. */
export interface ScenarioColumns {
  /** IDs der einzeln aufgezählten Städte, in der Reihenfolge des Plans. */
  relevant: CityId[];
  participants: Int32Array;
  leaders: Int32Array;
  days: Int32Array;
  /** Teilnehmer je einzeln aufgezählter Stadt, in der Reihenfolge von `relevant`. */
  cities: Int32Array[];
}

/** Die Teilnehmer der Stadt je Szenario; nur, wenn sie einzeln aufgezählt wurde. */
export function cityColumn(scenarios: ScenarioColumns, city: CityId): Int32Array | undefined {
  const index: number = scenarios.relevant.indexOf(city);
  return index < 0 ? undefined : scenarios.cities[index];
}

/** Eine Stadt, die in den Spalten nicht vorkommt: ein Fehler im Programm, nicht in den Eingaben. */
export function missingCity(city: CityId): Error {
  return new Error(`Stadt ${city} wurde nicht einzeln aufgezählt.`);
}

// In den Schleifen über Szenarien und Spalten sichern die Schleifengrenzen die Indizes; Zugriffe sind dort ungeprüft
// (`!`), weil eine Prüfung je Szenario die Rechnung bremsen würde.

/**
 * Alle Kombinationen aus Teilnehmern je Stadt, Leitern und Tagen, gleich als Spalten; Szenarien ohne Teilnehmer
 * entfallen. Die erste Stadt ändert sich am langsamsten, die Tage am schnellsten.
 *
 * Nur die Städte in `relevant` werden einzeln aufgezählt. Die übrigen wirken sich nur über die Gesamtzahl aus und
 * werden zu einer Spanne zusammengefasst – das ergibt dieselben Ergebnisse mit weit weniger Szenarien.
 */
export function enumerateScenarios(plan: Plan,
                                   relevant: readonly CityId[] = plan.cities.map(({id}: City): CityId => id),
                                   onProgress?: Progress): ScenarioColumns {
  const cities: readonly City[] = plan.cities;
  const enumerated: City[] = cities.filter((city: City): boolean => relevant.includes(city.id));
  let rest: Range = {start: 0, end: 0};
  for (const city of cities) {
    if (!relevant.includes(city.id)) {
      rest = {start: rest.start + city.participants.start, end: rest.end + city.participants.end};
    }
  }
  // Je relevanter Stadt ein Zähler, dahinter einer für die zusammengefassten Städte
  const spans: Range[] = [...enumerated.map((city: City): Range => city.participants), rest];
  const counts: number[] = spans.map((span: Range): number => span.start);
  const combinations: number = spans.reduce((product: number, span: Range): number =>
    product * (span.end - span.start + 1), 1);
  // Nur die allererste Kombination kann ganz ohne Teilnehmer sein
  const empty: number = counts.every((count: number): boolean => count === 0) ? 1 : 0;
  const leaders: number[] = range(plan.leaders);
  const days: number[] = range(plan.days);
  const size: number = (combinations - empty) * leaders.length * days.length;
  const columns: ScenarioColumns = {
    relevant: enumerated.map(({id}: City): CityId => id),
    participants: new Int32Array(size),
    leaders: new Int32Array(size),
    days: new Int32Array(size),
    cities: enumerated.map((): Int32Array => new Int32Array(size)),
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
          for (let c = 0; c < enumerated.length; c++) {
            columns.cities[c]![i] = counts[c]!;
          }
          i++;
        }
      }
    }
    // Weiterzählen wie ein Kilometerzähler, hinten am schnellsten
    for (let k = spans.length - 1; k >= 0; k--) {
      const span: Range = spans[k]!;
      if (++counts[k]! <= span.end) {
        break;
      }
      counts[k] = span.start;
    }
  }
  return columns;
}
