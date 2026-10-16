import {City} from './city';
import {Context} from './context';

/** Faktoren ohne Einstellungen. */
export type FixedKind = 'person' | 'participant' | 'leader' | 'day' | 'night';
/** Faktoren „pro angefangene Gruppe“ mit einstellbarer Gruppengröße. */
export type GroupKind = 'personGroup' | 'participantGroup';
/** Art eines Faktors, unabhängig von der Sprache: für Beschriftungen und das Dateiformat. */
export type ModifierKind = FixedKind | GroupKind | 'city';

export interface FixedModifier {
  readonly kind: FixedKind;
}

export interface GroupModifier {
  readonly kind: GroupKind;
  readonly groupSize: number;
}

/** „pro Teilnehmer aus …“; verweist über die ID auf eine Stadt des Plans. */
export interface CityModifier {
  readonly kind: 'city';
  readonly city: string;
}

/** Womit der Betrag einer Position malgenommen wird. */
export type Modifier = FixedModifier | GroupModifier | CityModifier;

export const PER_PERSON: FixedModifier = {kind: 'person'};
export const PER_PARTICIPANT: FixedModifier = {kind: 'participant'};
export const PER_LEADER: FixedModifier = {kind: 'leader'};
export const PER_DAY: FixedModifier = {kind: 'day'};
export const PER_NIGHT: FixedModifier = {kind: 'night'};

export function perPersonGroup(groupSize: number): GroupModifier {
  return {kind: 'personGroup', groupSize};
}

export function perParticipantGroup(groupSize: number): GroupModifier {
  return {kind: 'participantGroup', groupSize};
}

export function perCity(city: City): CityModifier {
  return {kind: 'city', city: city.id};
}

/** Alle Arten in der Reihenfolge des Auswahlmenüs; in dieser Reihenfolge stehen auch die Faktoren einer Position. */
export const MODIFIER_KINDS: readonly ModifierKind[] = [
  'person', 'participant', 'leader', 'day', 'night', 'personGroup', 'participantGroup', 'city',
];

const FIXED_KINDS: readonly string[] = MODIFIER_KINDS.slice(0, 5);
const GROUP_KINDS: readonly string[] = ['personGroup', 'participantGroup'];

export function isFixedKind(kind: unknown): kind is FixedKind {
  return typeof kind === 'string' && FIXED_KINDS.includes(kind);
}

export function isGroupKind(kind: unknown): kind is GroupKind {
  return typeof kind === 'string' && GROUP_KINDS.includes(kind);
}

/** Ein neuer Faktor, wie ihn das Menü „Faktor hinzufügen“ anlegt: Gruppen zu 10, Städte mit der ersten Stadt. */
export function createModifier(kind: ModifierKind, cities: readonly City[]): Modifier {
  if (isFixedKind(kind)) {
    return {kind};
  }
  if (isGroupKind(kind)) {
    return {kind, groupSize: 10};
  }
  return perCity(cities[0]);
}

/** Der Faktor in einem Szenario. */
export function factor(modifier: Modifier, context: Context): number {
  switch (modifier.kind) {
    case 'person':
      return context.participants + context.leaders;
    case 'participant':
      return context.participants;
    case 'leader':
      return context.leaders;
    case 'day':
      return context.days;
    case 'night':
      return Math.max(0, context.days - 1);
    case 'personGroup':
      return perGroup(context.participants + context.leaders, modifier.groupSize);
    case 'participantGroup':
      return perGroup(context.participants, modifier.groupSize);
    case 'city':
      return context.cities?.get(modifier.city) ?? 0;
  }
}

/** Angefangene Gruppen; ohne gültige Gruppengröße keine. */
function perGroup(count: number, groupSize: number): number {
  return groupSize > 0 ? Math.ceil(count / groupSize) : 0;
}

/** Sortiert nach Art, Gruppen nach Größe; Städte behalten ihre Reihenfolge. */
export function compareModifiers(a: Modifier, b: Modifier): number {
  const byKind: number = MODIFIER_KINDS.indexOf(a.kind) - MODIFIER_KINDS.indexOf(b.kind);
  if (byKind === 0 && 'groupSize' in a && 'groupSize' in b) {
    return a.groupSize - b.groupSize;
  }
  return byKind;
}
