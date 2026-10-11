import {ValueRange} from '../value-range';
import {Calculation, calculate} from './calculator';
import {Plan, planFromJson} from './plan';
import {City, Context, PerCityModifier, Position, PositionModifier} from './position';
import {ScenarioColumns, toColumns} from './scenarios';

/** Alles, was die Oberfläche aus einer Rechnung braucht – nur Zahlen, damit es sich an den Worker übergeben lässt. */
export interface EngineResult {
  /** Überschuss je Szenario. */
  values: Float64Array;
  debitValues: Float64Array;
  creditValues: Float64Array;
  /** Spanne je Position, erst Ausgaben, dann Einnahmen, in der Reihenfolge des Plans. */
  positionSums: ValueRange[];
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
  scenarios: ScenarioColumns;
}

export interface EngineRequest {
  id: number;
  /** Der Plan als JSON wie beim Speichern: Klassen und Objekt-Identität überstehen den Weg zum Worker nicht. */
  plan: string;
  perParticipant: boolean;
}

export type EngineResponse =
  | { id: number, result: EngineResult }
  | { id: number, error: string };

/** Städte, auf die ein Faktor „pro Teilnehmer aus …“ verweist. */
export function referencedCities(positions: Position[]): City[] {
  return positions
    .flatMap((position: Position): PositionModifier[] => position.getModifiers())
    .filter((modifier: PositionModifier): modifier is PerCityModifier => modifier instanceof PerCityModifier)
    .map((modifier: PerCityModifier): City => modifier.getCity());
}

/** Rechnet einen gespeicherten Plan vollständig durch; läuft im Worker, ohne Worker auch im Haupt-Thread. */
export function evaluate(json: string, perParticipant: boolean): EngineResult {
  const plan: Plan = planFromJson(json);
  const positions: Position[] = [...plan.debit, ...plan.credit];
  const relevant: City[] = referencedCities(positions);
  const contexts: Context[] = plan.contextRange.getPermutations(relevant);
  const calculation: Calculation = calculate(contexts, plan.contextRange, plan.debit, plan.credit, perParticipant);
  return {
    values: calculation.values,
    debitValues: calculation.debitValues,
    creditValues: calculation.creditValues,
    positionSums: positions.map((position: Position): ValueRange => calculation.positionSums.get(position)!),
    debitTotal: calculation.debitTotal,
    creditTotal: calculation.creditTotal,
    balance: calculation.balance,
    scenarios: toColumns(contexts, plan.contextRange.getCities(), relevant),
  };
}

/** Die großen Spalten werden übertragen statt kopiert; danach sind sie im Worker leer. */
export function transferables(result: EngineResult): ArrayBuffer[] {
  const scenarios: ScenarioColumns = result.scenarios;
  return [
    result.values, result.debitValues, result.creditValues,
    scenarios.participants, scenarios.leaders, scenarios.days, ...scenarios.cities,
  ].map((column: Float64Array | Int32Array): ArrayBuffer => column.buffer as ArrayBuffer);
}

/**
 * Alles aus dem gespeicherten Plan, was ein Ergebnis verändern kann. Titel und Namen fehlen: Umbenennen braucht
 * keine neue Rechnung.
 */
export function calculationKey(json: string, perParticipant: boolean): string {
  const data = JSON.parse(json);
  const numbers = (positions: { amount: number, modifiers: unknown[] }[]): unknown[] =>
    positions.map((position): unknown[] => [position.amount, position.modifiers]);
  return JSON.stringify([
    perParticipant, data.days, data.leaders,
    data.cities.map((city: { participants: unknown }): unknown => city.participants),
    numbers(data.debit), numbers(data.credit),
  ]);
}
