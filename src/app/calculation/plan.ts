import {
  City, ContextRange, ContextType, GroupModifier, PER_DAY, PER_LEADER, PER_NIGHT, PER_PARTICIPANT, PER_PERSON,
  PerCityModifier, PerGroupModifier, PerParticipantGroup, Position, PositionModifier, Range
} from './position';

export interface Plan {
  contextRange: ContextRange;
  debit: Position[];
  credit: Position[];
}

type ModifierData =
  | { type: 'person' | 'participant' | 'leader' | 'day' | 'night' }
  | { type: 'personGroup' | 'participantGroup', groupSize: number }
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

/** Version 1 kannte nur eine Teilnehmerspanne ohne Städte und wird beim Öffnen noch gelesen. */
interface PlanData {
  version: 2;
  days: Range;
  leaders: Range;
  cities: CityData[];
  debit: PositionData[];
  credit: PositionData[];
}

export function defaultPlan(): Plan {
  const dinslaken = new City('Dinslaken', {start: 20, end: 60});
  const voerde = new City('Voerde', {start: 0, end: 2});
  const huenxeWesel = new City('Hünxe/Wesel', {start: 0, end: 2});
  const others = City.others({start: 0, end: 2});
  return {
    contextRange: new ContextRange(new Map<ContextType, Range>([
      [ContextType.LEADERS, {start: 2, end: 8}],
      [ContextType.DAYS, {start: 2, end: 3}],
    ]), [dinslaken, voerde, huenxeWesel, others]),
    debit: [
      new Position('Verpflegung', 7, [PER_PERSON, PER_DAY]),
      new Position('Endreinigung Halle', 654.5),
      new Position('Nebenkosten Halle', 595),
      new Position('Halle', 345.1, [PER_DAY]),
      new Position('Bus', 1485),
      new Position('Programm', 200),
      new Position('2x Begleitfahrzeug', 168),
      new Position('Zugtickets', 400, [new PerParticipantGroup(10)]),
    ],
    credit: [
      new Position('Teilnehmerbeitrag', 60, [PER_PARTICIPANT]),
      new Position('Leiterbeitrag', 0, [PER_LEADER]),
      new Position('Förderung DV Münster', 3.5, [PER_PERSON, PER_DAY]),
      new Position('Förderung Leiter Dinslaken', 7, [new PerParticipantGroup(8), PER_DAY]),
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
    contextRange: new ContextRange(new Map<ContextType, Range>([
      [ContextType.LEADERS, {start: 2, end: 8}],
      [ContextType.DAYS, {start: 2, end: 3}],
    ]), []),
    debit: [],
    credit: [],
  };
}

export function planToJson(plan: Plan): string {
  const cities: City[] = plan.contextRange.getCities();
  const data: PlanData = {
    version: 2,
    days: plan.contextRange.get(ContextType.DAYS),
    leaders: plan.contextRange.get(ContextType.LEADERS),
    cities: cities.map((city: City): CityData => city.isOthers()
      ? {name: city.getName(), participants: city.getParticipants(), others: true}
      : {name: city.getName(), participants: city.getParticipants()}),
    debit: plan.debit.map((position: Position): PositionData => positionToData(position, cities)),
    credit: plan.credit.map((position: Position): PositionData => positionToData(position, cities)),
  };
  return JSON.stringify(data, null, 2);
}

export function planFromJson(json: string): Plan {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!isObject(data) || (data['version'] !== 1 && data['version'] !== 2)) {
    throw new Error('Die Datei ist kein CampPlan-Plan oder hat eine unbekannte Version.');
  }
  const cities: City[] = data['version'] === 1
    ? [City.others(rangeFromData(data['participants'], 'Teilnehmer'))]
    : citiesFromData(data['cities']);
  return {
    contextRange: new ContextRange(new Map<ContextType, Range>([
      [ContextType.DAYS, rangeFromData(data['days'], 'Tage')],
      [ContextType.LEADERS, rangeFromData(data['leaders'], 'Leiter')],
    ]), cities),
    debit: positionsFromData(data['debit'], 'Ausgaben', cities),
    credit: positionsFromData(data['credit'], 'Einnahmen', cities),
  };
}

function citiesFromData(data: unknown): City[] {
  if (!Array.isArray(data)) {
    throw new Error('Städte fehlen in der Datei.');
  }
  let othersFound: boolean = false;
  return data.map((entry: unknown): City => {
    if (!isObject(entry) || typeof entry['name'] !== 'string') {
      throw new Error('Ungültige Stadt in der Datei.');
    }
    const participants: Range = rangeFromData(entry['participants'], entry['name']);
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
  if (modifier === PER_PERSON) {
    return {type: 'person'};
  }
  if (modifier === PER_PARTICIPANT) {
    return {type: 'participant'};
  }
  if (modifier === PER_LEADER) {
    return {type: 'leader'};
  }
  if (modifier === PER_DAY) {
    return {type: 'day'};
  }
  if (modifier === PER_NIGHT) {
    return {type: 'night'};
  }
  if (modifier instanceof PerGroupModifier) {
    return {type: 'personGroup', groupSize: modifier.getGroupSize()};
  }
  if (modifier instanceof PerParticipantGroup) {
    return {type: 'participantGroup', groupSize: modifier.getGroupSize()};
  }
  if (modifier instanceof PerCityModifier) {
    return {type: 'city', city: cities.indexOf(modifier.getCity())};
  }
  throw new Error('Unbekannter Faktor: ' + modifier.getDescription());
}

function modifierFromData(data: unknown, cities: City[]): PositionModifier {
  if (!isObject(data)) {
    throw new Error('Ungültiger Faktor in der Datei.');
  }
  switch (data['type']) {
    case 'person':
      return PER_PERSON;
    case 'participant':
      return PER_PARTICIPANT;
    case 'leader':
      return PER_LEADER;
    case 'day':
      return PER_DAY;
    case 'night':
      return PER_NIGHT;
    case 'personGroup':
      return withGroupSize(new PerGroupModifier(0), data['groupSize']);
    case 'participantGroup':
      return withGroupSize(new PerParticipantGroup(0), data['groupSize']);
    case 'city': {
      const city: City | undefined = isNumber(data['city']) ? cities[data['city']] : undefined;
      if (!city) {
        throw new Error('Ein Faktor verweist auf eine unbekannte Stadt.');
      }
      return new PerCityModifier(city);
    }
    default:
      throw new Error(`Unbekannter Faktor „${String(data['type'])}“ in der Datei.`);
  }
}

function withGroupSize(modifier: GroupModifier, groupSize: unknown): GroupModifier {
  if (!isNumber(groupSize)) {
    throw new Error('Ungültige Gruppengröße in der Datei.');
  }
  modifier.setGroupSize(groupSize);
  return modifier;
}

function positionsFromData(data: unknown, label: string, cities: City[]): Position[] {
  if (!Array.isArray(data)) {
    throw new Error(`${label} fehlen in der Datei.`);
  }
  return data.map((entry: unknown): Position => {
    if (!isObject(entry) || typeof entry['title'] !== 'string' || !isNumber(entry['amount'])
      || !Array.isArray(entry['modifiers'])) {
      throw new Error(`Ungültige Position in ${label}.`);
    }
    return new Position(entry['title'], entry['amount'],
      entry['modifiers'].map((modifier: unknown): PositionModifier => modifierFromData(modifier, cities)));
  });
}

function rangeFromData(data: unknown, label: string): Range {
  if (!isObject(data) || !isNumber(data['start']) || !isNumber(data['end']) || data['start'] < 0
    || data['start'] > data['end']) {
    throw new Error(`Ungültiger Bereich für ${label}.`);
  }
  return {start: data['start'], end: data['end']};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
