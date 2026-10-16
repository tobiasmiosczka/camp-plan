import {Context} from '../calculation/context';
import {ScenarioColumns} from '../calculation/scenarios';

/** Jedes Szenario aus den Spalten als eigenes Objekt, um in Tests einzeln nachzurechnen. */
export function contextsOf(columns: ScenarioColumns): Context[] {
  return Array.from(columns.participants, (participants: number, i: number): Context => ({
    participants,
    leaders: columns.leaders[i],
    days: columns.days[i],
    cities: new Map<string, number>(columns.relevant.map((city: string, c: number): [string, number] =>
      [city, columns.cities[c][i]])),
  }));
}
