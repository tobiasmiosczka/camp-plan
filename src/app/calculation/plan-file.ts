import {City, newCity, OTHERS_NAME, othersCity} from './city';
import {ContextType} from './context';
import {CityId} from './id';
import {FixedKind, GroupKind, isFixedKind, isGroupKind, Modifier, perCity} from './modifiers';
import {Plan, Side, withOthersLast} from './plan';
import {newPosition, Position} from './position';
import {Range} from './range';

/** Das Dateiformat eines Plans: Lesen, Prüfen und Schreiben. Im Browser-Speicher steht dasselbe Format. */

type ModifierData =
  | { type: FixedKind }
  | { type: GroupKind, groupSize: number }
  | { type: 'city', city: number };

interface PositionData {
  title: string;
  amount: number;
  modifiers: ModifierData[];
}

interface CityData {
  name: string;
  participants: Range;
  others?: boolean;
}

/**
 * Der Plan, wie er gespeichert wird: als JSON, Faktoren verweisen über ihren Index auf Städte. Version 1 kannte nur
 * eine Teilnehmerspanne ohne Städte und wird noch gelesen.
 */
export interface PlanData {
  version: 2;
  /** Seit dem Projektnamen; ältere Dateien haben keinen. */
  name?: string;
  days: Range;
  leaders: Range;
  cities: CityData[];
  debit: PositionData[];
  credit: PositionData[];
}

/** Was an einer Datei nicht stimmt; die Oberfläche übersetzt es anhand von `code` und, wo vorhanden, `subject`. */
export type PlanFileProblem =
  | { code: 'invalidJson' | 'unknownVersion' | 'missingCities' | 'invalidCity' | 'invalidModifier' | 'unknownCity'
      | 'invalidGroupSize' }
  | { code: 'invalidRange', subject: ContextType }
  /** `subject`: der Name der Stadt, wie in der Datei. */
  | { code: 'invalidCityRange', subject: string }
  /** `subject`: die unbekannte Faktorart, wie in der Datei. */
  | { code: 'unknownModifier', subject: string }
  | { code: 'missingPositions' | 'invalidPosition', subject: Side };

/**
 * Fehler beim Lesen einer Plandatei. Die Meldung ist nur für Entwickler, etwa „invalidRange: days“; was der Nutzer
 * liest, übersetzt die Oberfläche aus {@link problem}.
 */
export class PlanFileError extends Error {
  constructor(readonly problem: PlanFileProblem) {
    super('subject' in problem ? `${problem.code}: ${problem.subject}` : problem.code);
    this.name = 'PlanFileError';
  }
}

export function planToData(plan: Plan): PlanData {
  const cities: CityId[] = plan.cities.map((city: City): CityId => city.id);
  return {
    version: 2,
    name: plan.name,
    days: {...plan.days},
    leaders: {...plan.leaders},
    cities: plan.cities.map((city: City): CityData => city.others
      ? {name: city.name, participants: {...city.participants}, others: true}
      : {name: city.name, participants: {...city.participants}}),
    debit: plan.debit.map((position: Position): PositionData => positionToData(position, cities)),
    credit: plan.credit.map((position: Position): PositionData => positionToData(position, cities)),
  };
}

export function planToJson(plan: Plan): string {
  return dataToJson(planToData(plan));
}

export function dataToJson(data: PlanData): string {
  return JSON.stringify(data, null, 2);
}

export function planFromJson(json: string): Plan {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new PlanFileError({code: 'invalidJson'});
  }
  return planFromData(data);
}

/** Prüft die Daten, bevor daraus ein Plan wird: Sie können aus einer beliebigen Datei stammen. */
function planFromData(data: unknown): Plan {
  if (!isObject(data) || (data['version'] !== 1 && data['version'] !== 2)) {
    throw new PlanFileError({code: 'unknownVersion'});
  }
  // In der Reihenfolge der Datei: Darauf beziehen sich die Faktoren
  const cities: City[] = data['version'] === 1
    ? [othersCity(rangeFromData(data['participants'], 'participants'))]
    : citiesFromData(data['cities']);
  return {
    name: typeof data['name'] === 'string' ? data['name'] : '',
    days: rangeFromData(data['days'], 'days'),
    leaders: rangeFromData(data['leaders'], 'leaders'),
    cities: withOthersLast(cities),
    debit: positionsFromData(data['debit'], 'debit', cities),
    credit: positionsFromData(data['credit'], 'credit', cities),
  };
}

function citiesFromData(data: unknown): City[] {
  if (!Array.isArray(data)) {
    throw new PlanFileError({code: 'missingCities'});
  }
  let othersFound: boolean = false;
  return data.map((entry: unknown): City => {
    if (!isObject(entry) || typeof entry['name'] !== 'string') {
      throw new PlanFileError({code: 'invalidCity'});
    }
    const participants: Range = cityRangeFromData(entry['participants'], entry['name']);
    // Ältere Dateien kennen das Kennzeichen noch nicht, nur den Namen
    if (!othersFound && (entry['others'] === true || entry['name'] === OTHERS_NAME)) {
      othersFound = true;
      return othersCity(participants);
    }
    return newCity(entry['name'], participants);
  });
}

/** `cities`: die IDs der Städte in der Reihenfolge der Datei. */
function positionToData(position: Position, cities: CityId[]): PositionData {
  return {
    title: position.title,
    amount: position.amount,
    modifiers: position.modifiers.map((modifier: Modifier): ModifierData => modifier.kind === 'city'
      ? {type: 'city', city: cities.indexOf(modifier.city)}
      : 'groupSize' in modifier ? {type: modifier.kind, groupSize: modifier.groupSize} : {type: modifier.kind}),
  };
}

function modifierFromData(data: unknown, cities: City[]): Modifier {
  if (!isObject(data)) {
    throw new PlanFileError({code: 'invalidModifier'});
  }
  const type: unknown = data['type'];
  if (isFixedKind(type)) {
    return {kind: type};
  }
  if (isGroupKind(type)) {
    if (!isNumber(data['groupSize'])) {
      throw new PlanFileError({code: 'invalidGroupSize'});
    }
    return {kind: type, groupSize: data['groupSize']};
  }
  if (type === 'city') {
    const city: City | undefined = isNumber(data['city']) ? cities[data['city']] : undefined;
    if (!city) {
      throw new PlanFileError({code: 'unknownCity'});
    }
    return perCity(city);
  }
  throw new PlanFileError({code: 'unknownModifier', subject: String(type)});
}

function positionsFromData(data: unknown, side: Side, cities: City[]): Position[] {
  if (!Array.isArray(data)) {
    throw new PlanFileError({code: 'missingPositions', subject: side});
  }
  return data.map((entry: unknown): Position => {
    if (!isObject(entry) || typeof entry['title'] !== 'string' || !isNumber(entry['amount'])
      || !Array.isArray(entry['modifiers'])) {
      throw new PlanFileError({code: 'invalidPosition', subject: side});
    }
    return newPosition(entry['title'], entry['amount'],
      entry['modifiers'].map((modifier: unknown): Modifier => modifierFromData(modifier, cities)));
  });
}

function rangeFromData(data: unknown, field: ContextType): Range {
  return checkedRange(data, () =>
    new PlanFileError({code: 'invalidRange', subject: field}));
}

function cityRangeFromData(data: unknown, city: string): Range {
  return checkedRange(data, () =>
    new PlanFileError({code: 'invalidCityRange', subject: city}));
}

/** Eine Kopie des Bereichs; ist er ungültig, wird der Fehler aus `error` geworfen. */
function checkedRange(data: unknown, error: () => PlanFileError): Range {
  if (!isRange(data)) {
    throw error();
  }
  return {start: data.start, end: data.end};
}

function isRange(data: unknown): data is Range {
  return isObject(data) && isNumber(data['start']) && isNumber(data['end']) && data['start'] >= 0
    && data['start'] <= data['end'];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
