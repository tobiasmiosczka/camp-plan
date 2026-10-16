import {City} from '../calculation/city';
import {Context, FixedContext} from '../calculation/context';
import {ScenarioColumns} from '../calculation/scenarios';

/** Jedes Szenario aus den Spalten als eigenes Objekt, um in Tests einzeln nachzurechnen. */
export function contextsOf(columns: ScenarioColumns, cities: City[]): Context[] {
  return Array.from(columns.participants, (participants: number, i: number): Context => new FixedContext(
    participants, columns.leaders[i], columns.days[i],
    new Map<City, number>(columns.relevant.map((city: number, c: number): [City, number] =>
      [cities[city], columns.cities[c][i]]))));
}
