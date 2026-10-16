import {Calculation, calculate} from './calculator';
import {Plan, PlanData, planFromData} from './plan';
import {City} from './city';
import {PerCityModifier, PositionModifier} from './modifiers';
import {Position} from './position';
import {phase, Progress} from './progress';
import {enumerateScenarios, ScenarioColumns} from './scenarios';

/** Anteil des Aufzählens an der ganzen Rechnung, gemessen; der Rest ist das Rechnen. */
const PHASE_SPLIT: number = 0.1;

/** Alles, was die Oberfläche aus einer Rechnung braucht – nur Zahlen, damit es sich an den Worker übergeben lässt. */
export interface EngineResult extends Calculation {
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
  const relevant: City[] = referencedCities([...plan.debit, ...plan.credit]);
  const scenarios: ScenarioColumns = enumerateScenarios(plan.contextRange, relevant, phase(onProgress, 0, PHASE_SPLIT));
  const calculation: Calculation = calculate(scenarios, plan.contextRange, plan.debit, plan.credit, perParticipant,
    phase(onProgress, PHASE_SPLIT, 1));
  return {...calculation, scenarios};
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
