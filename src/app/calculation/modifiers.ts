import {City} from './city';
import {Context, ContextType} from './context';

/** Faktoren ohne Einstellungen; es gibt jeden nur einmal. */
export type FixedKind = 'person' | 'participant' | 'leader' | 'day' | 'night';
/** Faktoren „pro angefangene Gruppe“ mit einstellbarer Gruppengröße. */
export type GroupKind = 'personGroup' | 'participantGroup';
/** Art eines Faktors, unabhängig von der Sprache: für Beschriftungen und das Dateiformat. */
export type ModifierKind = FixedKind | GroupKind | 'city';

export abstract class PositionModifier {

  public abstract readonly kind: ModifierKind;
  public abstract modify(context: Context): number;
}

export abstract class FixedModifier extends PositionModifier {

  public abstract override readonly kind: FixedKind;
}

export abstract class GroupModifier extends PositionModifier {

  public abstract override readonly kind: GroupKind;
  private groupSize: number;

  constructor(groupSize: number) {
    super();
    this.groupSize = groupSize;
  }

  public getGroupSize(): number {
    return this.groupSize;
  }

  public setGroupSize(groupSize: number): void {
    this.groupSize = groupSize;
  }

  protected divide(count: number): number {
    return this.groupSize > 0 ? Math.ceil(count / this.groupSize) : 0;
  }
}

class PerPersonModifier extends FixedModifier {

  readonly kind = 'person';

  modify(context: Context): number {
    const participants = context.get(ContextType.PARTICIPANTS) || 0;
    const leaders = context.get(ContextType.LEADERS) || 0;
    return participants + leaders
  }

}

export const PER_PERSON = new PerPersonModifier();

export class PerPersonGroupModifier extends GroupModifier {

  readonly kind = 'personGroup';

  modify(context: Context): number {
    const participants = context.get(ContextType.PARTICIPANTS);
    const leaders = context.get(ContextType.LEADERS);
    return this.divide(participants + leaders);
  }
}

class PerParticipantModifier extends FixedModifier {

  readonly kind = 'participant';

  modify(context: Context): number {
    return context.get(ContextType.PARTICIPANTS);
  }

}

export const PER_PARTICIPANT = new PerParticipantModifier();

class PerLeaderModifier extends FixedModifier {

  readonly kind = 'leader';

  modify(context: Context): number {
    return context.get(ContextType.LEADERS);
  }
}

export const PER_LEADER = new PerLeaderModifier();

class PerDayModifier extends FixedModifier {

  readonly kind = 'day';

  modify(context: Context): number {
    return context.get(ContextType.DAYS);
  }

}

export const PER_DAY = new PerDayModifier();

class PerNightModifier extends FixedModifier {

  readonly kind = 'night';

  modify(context: Context): number {
    return Math.max(0, context.get(ContextType.DAYS) - 1);
  }

}

export const PER_NIGHT = new PerNightModifier();

export class PerParticipantGroupModifier extends GroupModifier {

  readonly kind = 'participantGroup';

  modify(context: Context): number {
    return this.divide(context.get(ContextType.PARTICIPANTS));
  }
}

export class PerCityModifier extends PositionModifier {

  readonly kind = 'city';

  private city: City;

  constructor(city: City) {
    super();
    this.city = city;
  }

  public getCity(): City {
    return this.city;
  }

  public setCity(city: City): void {
    this.city = city;
  }

  modify(context: Context): number {
    return context.getParticipantsFrom(this.city);
  }
}

/** Die festen Faktoren je Art. */
export const FIXED_MODIFIERS: Record<FixedKind, FixedModifier> = {
  person: PER_PERSON,
  participant: PER_PARTICIPANT,
  leader: PER_LEADER,
  day: PER_DAY,
  night: PER_NIGHT,
};

/** Die Gruppenfaktoren je Art. */
export const GROUP_MODIFIERS: Record<GroupKind, new (groupSize: number) => GroupModifier> = {
  personGroup: PerPersonGroupModifier,
  participantGroup: PerParticipantGroupModifier,
};

/** Alle Arten in der Reihenfolge des Auswahlmenüs; in dieser Reihenfolge stehen auch die Faktoren einer Position. */
export const MODIFIER_KINDS: readonly ModifierKind[] = [
  'person', 'participant', 'leader', 'day', 'night', 'personGroup', 'participantGroup', 'city',
];

export function isFixedKind(kind: unknown): kind is FixedKind {
  return typeof kind === 'string' && Object.hasOwn(FIXED_MODIFIERS, kind);
}

export function isGroupKind(kind: unknown): kind is GroupKind {
  return typeof kind === 'string' && Object.hasOwn(GROUP_MODIFIERS, kind);
}

/** Ein neuer Faktor, wie ihn das Menü „Faktor hinzufügen“ anlegt: Gruppen zu 10, Städte mit der ersten Stadt. */
export function createModifier(kind: ModifierKind, cities: City[]): PositionModifier {
  if (isFixedKind(kind)) {
    return FIXED_MODIFIERS[kind];
  }
  if (isGroupKind(kind)) {
    return new GROUP_MODIFIERS[kind](10);
  }
  return new PerCityModifier(cities[0]);
}

/** Sortiert nach Art, gleiche Arten nach Gruppengröße oder Stadtname. */
export function compareModifiers(a: PositionModifier, b: PositionModifier): number {
  const byKind: number = MODIFIER_KINDS.indexOf(a.kind) - MODIFIER_KINDS.indexOf(b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  if (a instanceof GroupModifier && b instanceof GroupModifier) {
    return a.getGroupSize() - b.getGroupSize();
  }
  if (a instanceof PerCityModifier && b instanceof PerCityModifier) {
    return a.getCity().getName().localeCompare(b.getCity().getName(), undefined, {numeric: true});
  }
  return 0;
}
