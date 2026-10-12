import {ValueRange} from '../value-range';
import {Calculation, calculate} from './calculator';
import {Plan, PlanData, planFromData} from './plan';
import {City, Context, PerCityModifier, Position, PositionModifier} from './position';
import {phase, Progress} from './progress';
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
  /** Der Plan als reine Daten wie beim Speichern: Klassen und Objekt-Identität überstehen den Weg zum Worker nicht. */
  plan: PlanData;
  perParticipant: boolean;
}

export type EngineResponse =
  | { id: number, result: EngineResult }
  | { id: number, progress: number }
  | { id: number, error: string };

/** Städte, auf die ein Faktor „pro Teilnehmer aus …“ verweist. */
export function referencedCities(positions: Position[]): City[] {
  return positions
    .flatMap((position: Position): PositionModifier[] => position.getModifiers())
    .filter((modifier: PositionModifier): modifier is PerCityModifier => modifier instanceof PerCityModifier)
    .map((modifier: PerCityModifier): City => modifier.getCity());
}

/**
 * Rechnet einen gespeicherten Plan vollständig durch; läuft im Worker, ohne Worker auch im Haupt-Thread.
 * Die Anteile der Phasen am Fortschritt sind gemessen, damit der Ladebalken gleichmäßig läuft.
 */
export function evaluate(data: PlanData, perParticipant: boolean, onProgress?: Progress): EngineResult {
  const plan: Plan = planFromData(data);
  const positions: Position[] = [...plan.debit, ...plan.credit];
  const relevant: City[] = referencedCities(positions);
  const contexts: Context[] = plan.contextRange.getPermutations(relevant, phase(onProgress, 0, 0.35));
  const calculation: Calculation = calculate(contexts, plan.contextRange, plan.debit, plan.credit, perParticipant,
    phase(onProgress, 0.35, 0.9));
  return {
    values: calculation.values,
    debitValues: calculation.debitValues,
    creditValues: calculation.creditValues,
    positionSums: positions.map((position: Position): ValueRange => calculation.positionSums.get(position)!),
    debitTotal: calculation.debitTotal,
    creditTotal: calculation.creditTotal,
    balance: calculation.balance,
    scenarios: toColumns(contexts, plan.contextRange.getCities(), relevant, phase(onProgress, 0.9, 1)),
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
 * Alles aus dem Plan, was ein Ergebnis verändern kann. Titel und Namen fehlen: Umbenennen braucht keine neue
 * Rechnung.
 */
export function calculationKey(data: PlanData, perParticipant: boolean): string {
  const numbers = (positions: PlanData['debit']): unknown[] =>
    positions.map((position): unknown[] => [position.amount, position.modifiers]);
  return JSON.stringify([
    perParticipant, data.days, data.leaders,
    data.cities.map((city): unknown => city.participants),
    numbers(data.debit), numbers(data.credit),
  ]);
}
