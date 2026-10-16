import {City, newCity, OTHERS_NAME, othersCity} from './city';
import {ContextType} from './context';
import {
  FixedKind, GroupKind, isFixedKind, isGroupKind, Modifier, PER_DAY, PER_LEADER, PER_NIGHT, PER_PARTICIPANT,
  PER_PERSON, perCity, perParticipantGroup
} from './modifiers';
import {newPosition, Position} from './position';
import {Range} from './range';

/** Kontoseite einer Position. */
export type Side = 'debit' | 'credit';

/**
 * Ein Plan. Unveränderlich: Jede Änderung ergibt einen neuen Plan, unveränderte Teile werden übernommen. Städte und
 * Positionen haben IDs, damit Faktoren, Ergebnisse und Tabellenzeilen sie über Änderungen hinweg wiederfinden.
 */
export interface Plan {
  /** Projektname, z. B. „Sommerlager 2027“; leer, wenn keiner vergeben ist. */
  readonly name: string;
  readonly days: Range;
  readonly leaders: Range;
  /** „Sonstige“ steht immer genau einmal am Ende, siehe {@link withOthersLast}. */
  readonly cities: readonly City[];
  readonly debit: readonly Position[];
  readonly credit: readonly Position[];
}

/** Spanne einer Größe; die Teilnehmer ergeben sich aus den Städten, ohne Teilnehmer wird nicht gerechnet. */
export function rangeOf(plan: Plan, type: ContextType): Range {
  if (type !== 'participants') {
    return plan[type];
  }
  let start: number = 0;
  let end: number = 0;
  for (const city of plan.cities) {
    start += city.participants.start;
    end += city.participants.end;
  }
  return {start: Math.max(1, start), end};
}

/** Die Städte mit genau einem „Sonstige“ am Ende; fehlt es, wird es ergänzt. */
export function withOthersLast(cities: readonly City[]): City[] {
  const others: City = cities.find((city: City): boolean => city.others) ?? othersCity();
  return [...cities.filter((city: City): boolean => !city.others), others];
}

/** Alle Positionen, erst Ausgaben, dann Einnahmen. */
export function positionsOf(plan: Plan): Position[] {
  return [...plan.debit, ...plan.credit];
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

/** Was an einer Datei nicht stimmt; die Oberfläche übersetzt es anhand von `code` und `subject`. */
export type PlanFileErrorCode =
  | 'invalidJson' | 'unknownVersion' | 'missingCities' | 'invalidCity' | 'invalidRange' | 'invalidCityRange'
  | 'invalidModifier' | 'unknownModifier' | 'unknownCity' | 'invalidGroupSize' | 'missingPositions'
  | 'invalidPosition';

/**
 * Fehler beim Lesen einer Plandatei. Die Meldung ist deutsch und für Entwickler; `subject` nennt, worauf er sich
 * bezieht: eine {@link ContextType}, eine Kontoseite ('debit' oder 'credit'), einen Stadtnamen oder eine Faktorart.
 */
export class PlanFileError extends Error {
  constructor(readonly code: PlanFileErrorCode, message: string, readonly subject: string = '') {
    super(message);
    this.name = 'PlanFileError';
  }
}

const RANGE_LABELS: Record<ContextType, string> = {participants: 'Teilnehmer', days: 'Tage', leaders: 'Leiter'};
const SIDE_LABELS: Record<Side, string> = {debit: 'Ausgaben', credit: 'Einnahmen'};

export function defaultPlan(): Plan {
  const dinslaken: City = newCity('Dinslaken', {start: 20, end: 60});
  const voerde: City = newCity('Voerde', {start: 0, end: 2});
  const huenxeWesel: City = newCity('Hünxe/Wesel', {start: 0, end: 2});
  return {
    ...emptyPlan(),
    name: 'Beispiel-Zeltlager',
    cities: [dinslaken, voerde, huenxeWesel, othersCity({start: 0, end: 2})],
    debit: [
      newPosition('Verpflegung', 7, [PER_PERSON, PER_DAY]),
      newPosition('Endreinigung Halle', 654.5),
      newPosition('Nebenkosten Halle', 595),
      newPosition('Halle', 345.1, [PER_DAY]),
      newPosition('Bus', 1485),
      newPosition('Programm', 200),
      newPosition('2x Begleitfahrzeug', 168),
      newPosition('Zugtickets', 400, [perParticipantGroup(10)]),
    ],
    credit: [
      newPosition('Teilnehmerbeitrag', 60, [PER_PARTICIPANT]),
      newPosition('Leiterbeitrag', 0, [PER_LEADER]),
      newPosition('Förderung DV Münster', 3.5, [PER_PERSON, PER_DAY]),
      newPosition('Förderung Leiter Dinslaken', 7, [perParticipantGroup(8), PER_DAY]),
      newPosition('Förderung Teilnehmer Dinslaken', 4, [perCity(dinslaken), PER_NIGHT]),
      newPosition('Förderung Teilnehmer Voerde', 2.9, [perCity(voerde), PER_NIGHT]),
      newPosition('Förderung Teilnehmer Hünxe/Wesel', 3.5, [perCity(huenxeWesel), PER_NIGHT]),
      newPosition('Bildungsstunden', 2.5 * 10, [PER_PERSON]),
      newPosition('Großzügige Spende', 4000)
    ],
  };
}

/** Plan ohne Städte und Positionen; Tage und Leiter wie im Beispiel. */
export function emptyPlan(): Plan {
  return {
    name: '',
    days: {start: 2, end: 3},
    leaders: {start: 2, end: 8},
    cities: [othersCity()],
    debit: [],
    credit: [],
  };
}

export function planToData(plan: Plan): PlanData {
  const cities: string[] = plan.cities.map((city: City): string => city.id);
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
    throw new PlanFileError('invalidJson', 'Die Datei ist kein gültiges JSON.');
  }
  return planFromData(data);
}

/** Prüft die Daten, bevor daraus ein Plan wird: Sie können aus einer beliebigen Datei stammen. */
export function planFromData(data: unknown): Plan {
  if (!isObject(data) || (data['version'] !== 1 && data['version'] !== 2)) {
    throw new PlanFileError('unknownVersion', 'Die Datei ist kein CampPlan-Plan oder hat eine unbekannte Version.');
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
    throw new PlanFileError('missingCities', 'Städte fehlen in der Datei.');
  }
  let othersFound: boolean = false;
  return data.map((entry: unknown): City => {
    if (!isObject(entry) || typeof entry['name'] !== 'string') {
      throw new PlanFileError('invalidCity', 'Ungültige Stadt in der Datei.');
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
function positionToData(position: Position, cities: string[]): PositionData {
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
    throw new PlanFileError('invalidModifier', 'Ungültiger Faktor in der Datei.');
  }
  const type: unknown = data['type'];
  if (isFixedKind(type)) {
    return {kind: type};
  }
  if (isGroupKind(type)) {
    if (!isNumber(data['groupSize'])) {
      throw new PlanFileError('invalidGroupSize', 'Ungültige Gruppengröße in der Datei.');
    }
    return {kind: type, groupSize: data['groupSize']};
  }
  if (type === 'city') {
    const city: City | undefined = isNumber(data['city']) ? cities[data['city']] : undefined;
    if (!city) {
      throw new PlanFileError('unknownCity', 'Ein Faktor verweist auf eine unbekannte Stadt.');
    }
    return perCity(city);
  }
  throw new PlanFileError('unknownModifier', `Unbekannter Faktor „${String(type)}“ in der Datei.`, String(type));
}

function positionsFromData(data: unknown, side: Side, cities: City[]): Position[] {
  if (!Array.isArray(data)) {
    throw new PlanFileError('missingPositions', `${SIDE_LABELS[side]} fehlen in der Datei.`, side);
  }
  return data.map((entry: unknown): Position => {
    if (!isObject(entry) || typeof entry['title'] !== 'string' || !isNumber(entry['amount'])
      || !Array.isArray(entry['modifiers'])) {
      throw new PlanFileError('invalidPosition', `Ungültige Position in ${SIDE_LABELS[side]}.`, side);
    }
    return newPosition(entry['title'], entry['amount'],
      entry['modifiers'].map((modifier: unknown): Modifier => modifierFromData(modifier, cities)));
  });
}

function rangeFromData(data: unknown, field: ContextType): Range {
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
