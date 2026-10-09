import {
  ContextRange, ContextType, GroupModifier, PER_DAY, PER_LEADER, PER_PARTICIPANT, PER_PERSON, PerGroupModifier,
  PerParticipantGroup, Position, PositionModifier, Range
} from './position';

export interface Plan {
  contextRange: ContextRange;
  debit: Position[];
  credit: Position[];
}

type ModifierData =
  | { type: 'person' | 'participant' | 'leader' | 'day' }
  | { type: 'personGroup' | 'participantGroup', groupSize: number };

interface PositionData {
  title: string;
  amount: number;
  modifiers: ModifierData[];
}

interface PlanData {
  version: 1;
  days: Range;
  participants: Range;
  leaders: Range;
  debit: PositionData[];
  credit: PositionData[];
}

export function defaultPlan(): Plan {
  return {
    contextRange: new ContextRange(new Map<ContextType, Range>([
      [ContextType.PARTICIPANTS, {start: 8, end: 100, step: 1}],
      [ContextType.LEADERS, {start: 2, end: 8, step: 1}],
      [ContextType.DAYS, {start: 2, end: 3, step: 1}],
    ])),
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
      new Position('Förderung Teilnehmer Dinslaken', 4, [PER_PARTICIPANT, PER_DAY]),
      new Position('Bildungsstunden', 2.5 * 10, [PER_PERSON]),
      new Position('Großzügige Spende', 4000)
    ],
  };
}

export function planToJson(plan: Plan): string {
  const data: PlanData = {
    version: 1,
    days: plan.contextRange.get(ContextType.DAYS),
    participants: plan.contextRange.get(ContextType.PARTICIPANTS),
    leaders: plan.contextRange.get(ContextType.LEADERS),
    debit: plan.debit.map(positionToData),
    credit: plan.credit.map(positionToData),
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
  if (!isObject(data) || data['version'] !== 1) {
    throw new Error('Die Datei ist kein CampPlan-Plan oder hat eine unbekannte Version.');
  }
  return {
    contextRange: new ContextRange(new Map<ContextType, Range>([
      [ContextType.DAYS, rangeFromData(data['days'], 'Tage')],
      [ContextType.PARTICIPANTS, rangeFromData(data['participants'], 'Teilnehmer')],
      [ContextType.LEADERS, rangeFromData(data['leaders'], 'Leiter')],
    ])),
    debit: positionsFromData(data['debit'], 'Ausgaben'),
    credit: positionsFromData(data['credit'], 'Einnahmen'),
  };
}

function positionToData(position: Position): PositionData {
  return {
    title: position.getTitle(),
    amount: position.getAmount(),
    modifiers: position.getModifiers().map(modifierToData),
  };
}

function modifierToData(modifier: PositionModifier): ModifierData {
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
  if (modifier instanceof PerGroupModifier) {
    return {type: 'personGroup', groupSize: modifier.getGroupSize()};
  }
  if (modifier instanceof PerParticipantGroup) {
    return {type: 'participantGroup', groupSize: modifier.getGroupSize()};
  }
  throw new Error('Unbekannter Faktor: ' + modifier.getDescription());
}

function modifierFromData(data: unknown): PositionModifier {
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
    case 'personGroup':
      return withGroupSize(new PerGroupModifier(0), data['groupSize']);
    case 'participantGroup':
      return withGroupSize(new PerParticipantGroup(0), data['groupSize']);
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

function positionsFromData(data: unknown, label: string): Position[] {
  if (!Array.isArray(data)) {
    throw new Error(`${label} fehlen in der Datei.`);
  }
  return data.map((entry: unknown): Position => {
    if (!isObject(entry) || typeof entry['title'] !== 'string' || !isNumber(entry['amount'])
      || !Array.isArray(entry['modifiers'])) {
      throw new Error(`Ungültige Position in ${label}.`);
    }
    return new Position(entry['title'], entry['amount'], entry['modifiers'].map(modifierFromData));
  });
}

function rangeFromData(data: unknown, label: string): Range {
  if (!isObject(data) || !isNumber(data['start']) || !isNumber(data['end']) || data['start'] > data['end']) {
    throw new Error(`Ungültiger Bereich für ${label}.`);
  }
  return {start: data['start'], end: data['end'], step: 1};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
