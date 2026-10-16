import {City} from './city';
import {ContextRange, ContextType} from './context';
import {
  FIXED_MODIFIERS, FixedKind, FixedModifier, GROUP_MODIFIERS, GroupKind, GroupModifier, isFixedKind, isGroupKind,
  PER_DAY, PER_LEADER, PER_NIGHT, PER_PARTICIPANT, PER_PERSON, PerCityModifier, PerParticipantGroupModifier,
  PositionModifier
} from './modifiers';
import {Position} from './position';
import {Range} from './range';

export interface Plan {
  /** Projektname, z. B. „Sommerlager 2027“; leer, wenn keiner vergeben ist. */
  name: string;
  contextRange: ContextRange;
  debit: Position[];
  credit: Position[];
}

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
 * Der Plan als reine Daten, wie er gespeichert wird. Ohne Klassen und Objekt-Identität: lässt sich als JSON speichern
 * und an den Web Worker schicken. Version 1 kannte nur eine Teilnehmerspanne ohne Städte und wird noch gelesen.
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

/** Was an einer Datei nicht stimmt; die Oberfläche übersetzt es anhand von `code` und `subject`. */
export type PlanFileErrorCode =
  | 'invalidJson' | 'unknownVersion' | 'missingCities' | 'invalidCity' | 'invalidRange' | 'invalidCityRange'
  | 'invalidModifier' | 'unknownModifier' | 'unknownCity' | 'invalidGroupSize' | 'missingPositions'
  | 'invalidPosition';

/** Bereich mit fester Bedeutung; bei Städten steht deren Name im `subject`. */
export type RangeField = 'participants' | 'days' | 'leaders';

/**
 * Fehler beim Lesen einer Plandatei. Die Meldung ist deutsch und für Entwickler; `subject` nennt, worauf er sich
 * bezieht: ein {@link RangeField}, eine Kontoseite ('debit' oder 'credit'), einen Stadtnamen oder eine Faktorart.
 */
export class PlanFileError extends Error {
  constructor(readonly code: PlanFileErrorCode, message: string, readonly subject: string = '') {
    super(message);
    this.name = 'PlanFileError';
  }
}

const RANGE_LABELS: Record<RangeField, string> = {participants: 'Teilnehmer', days: 'Tage', leaders: 'Leiter'};
const SIDE_LABELS: Record<'debit' | 'credit', string> = {debit: 'Ausgaben', credit: 'Einnahmen'};

/** Leiter und Tage, mit denen ein neuer Plan beginnt. */
function defaultContextRange(cities: City[]): ContextRange {
  return new ContextRange(new Map<ContextType, Range>([
    [ContextType.LEADERS, {start: 2, end: 8}],
    [ContextType.DAYS, {start: 2, end: 3}],
  ]), cities);
}

export function defaultPlan(): Plan {
  const dinslaken = new City('Dinslaken', {start: 20, end: 60});
  const voerde = new City('Voerde', {start: 0, end: 2});
  const huenxeWesel = new City('Hünxe/Wesel', {start: 0, end: 2});
  const others = City.others({start: 0, end: 2});
  return {
    name: 'Beispiel-Zeltlager',
    contextRange: defaultContextRange([dinslaken, voerde, huenxeWesel, others]),
    debit: [
      new Position('Verpflegung', 7, [PER_PERSON, PER_DAY]),
      new Position('Endreinigung Halle', 654.5),
      new Position('Nebenkosten Halle', 595),
      new Position('Halle', 345.1, [PER_DAY]),
      new Position('Bus', 1485),
      new Position('Programm', 200),
      new Position('2x Begleitfahrzeug', 168),
      new Position('Zugtickets', 400, [new PerParticipantGroupModifier(10)]),
    ],
    credit: [
      new Position('Teilnehmerbeitrag', 60, [PER_PARTICIPANT]),
      new Position('Leiterbeitrag', 0, [PER_LEADER]),
      new Position('Förderung DV Münster', 3.5, [PER_PERSON, PER_DAY]),
      new Position('Förderung Leiter Dinslaken', 7, [new PerParticipantGroupModifier(8), PER_DAY]),
      new Position('Förderung Teilnehmer Dinslaken', 4, [new PerCityModifier(dinslaken), PER_NIGHT]),
      new Position('Förderung Teilnehmer Voerde', 2.9, [new PerCityModifier(voerde), PER_NIGHT]),
      new Position('Förderung Teilnehmer Hünxe/Wesel', 3.5, [new PerCityModifier(huenxeWesel), PER_NIGHT]),
      new Position('Bildungsstunden', 2.5 * 10, [PER_PERSON]),
      new Position('Großzügige Spende', 4000)
    ],
  };
}

/** Plan ohne Städte und Positionen; Tage und Leiter wie im Beispiel. */
export function emptyPlan(): Plan {
  return {
    name: '',
    contextRange: defaultContextRange([]),
    debit: [],
    credit: [],
  };
}

/** Bereiche werden kopiert: Die Daten bleiben gleich, auch wenn der Plan danach geändert wird. */
export function planToData(plan: Plan): PlanData {
  const cities: City[] = plan.contextRange.getCities();
  return {
    version: 2,
    name: plan.name,
    days: {...plan.contextRange.get(ContextType.DAYS)},
    leaders: {...plan.contextRange.get(ContextType.LEADERS)},
    cities: cities.map((city: City): CityData => city.isOthers()
      ? {name: city.getName(), participants: {...city.getParticipants()}, others: true}
      : {name: city.getName(), participants: {...city.getParticipants()}}),
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
    throw new PlanFileError('invalidJson', 'Die Datei ist kein gültiges JSON.');
  }
  return planFromData(data);
}

/** Prüft die Daten, bevor daraus ein Plan wird: Sie können aus einer beliebigen Datei stammen. */
export function planFromData(data: unknown): Plan {
  if (!isObject(data) || (data['version'] !== 1 && data['version'] !== 2)) {
    throw new PlanFileError('unknownVersion', 'Die Datei ist kein CampPlan-Plan oder hat eine unbekannte Version.');
  }
  const cities: City[] = data['version'] === 1
    ? [City.others(rangeFromData(data['participants'], 'participants'))]
    : citiesFromData(data['cities']);
  return {
    name: typeof data['name'] === 'string' ? data['name'] : '',
    contextRange: new ContextRange(new Map<ContextType, Range>([
      [ContextType.DAYS, rangeFromData(data['days'], 'days')],
      [ContextType.LEADERS, rangeFromData(data['leaders'], 'leaders')],
    ]), cities),
    debit: positionsFromData(data['debit'], 'debit', cities),
    credit: positionsFromData(data['credit'], 'credit', cities),
  };
}

function citiesFromData(data: unknown): City[] {
  if (!Array.isArray(data)) {
    throw new PlanFileError('missingCities', 'Städte fehlen in der Datei.');
  }
  let othersFound: boolean = false;
  return data.map((entry: unknown): City => {
    if (!isObject(entry) || typeof entry['name'] !== 'string') {
      throw new PlanFileError('invalidCity', 'Ungültige Stadt in der Datei.');
    }
    const participants: Range = cityRangeFromData(entry['participants'], entry['name']);
    // Ältere Dateien kennen das Kennzeichen noch nicht, nur den Namen
    if (!othersFound && (entry['others'] === true || entry['name'] === City.OTHERS_NAME)) {
      othersFound = true;
      return City.others(participants);
    }
    return new City(entry['name'], participants);
  });
}

function positionToData(position: Position, cities: City[]): PositionData {
  return {
    title: position.getTitle(),
    amount: position.getAmount(),
    modifiers: position.getModifiers().map((modifier: PositionModifier): ModifierData => modifierToData(modifier, cities)),
  };
}

function modifierToData(modifier: PositionModifier, cities: City[]): ModifierData {
  if (modifier instanceof FixedModifier) {
    return {type: modifier.kind};
  }
  if (modifier instanceof GroupModifier) {
    return {type: modifier.kind, groupSize: modifier.getGroupSize()};
  }
  if (modifier instanceof PerCityModifier) {
    return {type: 'city', city: cities.indexOf(modifier.getCity())};
  }
  throw new Error('Unbekannter Faktor: ' + modifier.kind);
}

function modifierFromData(data: unknown, cities: City[]): PositionModifier {
  if (!isObject(data)) {
    throw new PlanFileError('invalidModifier', 'Ungültiger Faktor in der Datei.');
  }
  const type: unknown = data['type'];
  if (isFixedKind(type)) {
    return FIXED_MODIFIERS[type];
  }
  if (isGroupKind(type)) {
    if (!isNumber(data['groupSize'])) {
      throw new PlanFileError('invalidGroupSize', 'Ungültige Gruppengröße in der Datei.');
    }
    return new GROUP_MODIFIERS[type](data['groupSize']);
  }
  if (type === 'city') {
    const city: City | undefined = isNumber(data['city']) ? cities[data['city']] : undefined;
    if (!city) {
      throw new PlanFileError('unknownCity', 'Ein Faktor verweist auf eine unbekannte Stadt.');
    }
    return new PerCityModifier(city);
  }
  throw new PlanFileError('unknownModifier', `Unbekannter Faktor „${String(type)}“ in der Datei.`, String(type));
}

function positionsFromData(data: unknown, side: 'debit' | 'credit', cities: City[]): Position[] {
  if (!Array.isArray(data)) {
    throw new PlanFileError('missingPositions', `${SIDE_LABELS[side]} fehlen in der Datei.`, side);
  }
  return data.map((entry: unknown): Position => {
    if (!isObject(entry) || typeof entry['title'] !== 'string' || !isNumber(entry['amount'])
      || !Array.isArray(entry['modifiers'])) {
      throw new PlanFileError('invalidPosition', `Ungültige Position in ${SIDE_LABELS[side]}.`, side);
    }
    return new Position(entry['title'], entry['amount'],
      entry['modifiers'].map((modifier: unknown): PositionModifier => modifierFromData(modifier, cities)));
  });
}

function rangeFromData(data: unknown, field: RangeField): Range {
  return checkedRange(data, () =>
    new PlanFileError('invalidRange', `Ungültiger Bereich für ${RANGE_LABELS[field]}.`, field));
}

function cityRangeFromData(data: unknown, city: string): Range {
  return checkedRange(data, () => new PlanFileError('invalidCityRange', `Ungültiger Bereich für ${city}.`, city));
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
