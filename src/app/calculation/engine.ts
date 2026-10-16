import {Calculation, calculate} from './calculator';
import {City} from './city';
import {Modifier} from './modifiers';
import {Plan, positionsOf} from './plan';
import {Position} from './position';
import {phase, Progress} from './progress';
import {enumerateScenarios, ScenarioColumns} from './scenarios';

/** Anteil des Aufzählens an der ganzen Rechnung, gemessen; der Rest ist das Rechnen. */
const PHASE_SPLIT: number = 0.2;

/** Alles, was die Oberfläche aus einer Rechnung braucht – nur Zahlen, damit es sich an den Worker übergeben lässt. */
export interface EngineResult extends Calculation {
  scenarios: ScenarioColumns;
}

export interface EngineRequest {
  id: number;
  /** Reine Daten ohne Klassen: Der Plan übersteht den Weg zum Worker unverändert, samt IDs. */
  plan: Plan;
  perParticipant: boolean;
}

export type EngineResponse =
  | { id: number, result: EngineResult }
  | { id: number, progress: number }
  | { id: number, error: string };

/** IDs der Städte, auf die ein Faktor „pro Teilnehmer aus …“ verweist. */
export function referencedCities(plan: Plan): string[] {
  const ids: Set<string> = new Set<string>(positionsOf(plan).flatMap((position: Position): string[] =>
    position.modifiers.flatMap((modifier: Modifier): string[] => modifier.kind === 'city' ? [modifier.city] : [])));
  return plan.cities.map(({id}: City): string => id).filter((id: string): boolean => ids.has(id));
}

/**
 * Rechnet einen Plan vollständig durch; läuft im Worker, ohne Worker auch im Haupt-Thread.
 * Die Anteile der Phasen am Fortschritt sind gemessen, damit der Ladebalken gleichmäßig läuft.
 */
export function evaluate(plan: Plan, perParticipant: boolean, onProgress?: Progress): EngineResult {
  const scenarios: ScenarioColumns =
    enumerateScenarios(plan, referencedCities(plan), phase(onProgress, 0, PHASE_SPLIT));
  const calculation: Calculation = calculate(scenarios, plan, perParticipant, phase(onProgress, PHASE_SPLIT, 1));
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
 * Rechnung. Die IDs gehören dazu, weil das Ergebnis über sie den Positionen und Städten zugeordnet wird.
 */
export function calculationKey(plan: Plan, perParticipant: boolean): string {
  return JSON.stringify([
    perParticipant, plan.days, plan.leaders,
    plan.cities.map((city: City): unknown => [city.id, city.participants]),
    positionsOf(plan).map((position: Position): unknown => [position.id, position.amount, position.modifiers]),
    plan.debit.length,
  ]);
}
