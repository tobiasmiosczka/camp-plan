import {computed, effect, inject, Injectable, signal} from '@angular/core';
import {City, newCity} from './calculation/city';
import {AdjustableType} from './calculation/context';
import {Modifier} from './calculation/modifiers';
import {
  dataToJson, defaultPlan, emptyPlan, Plan, PlanData, planFromJson, planToData, positionsOf, Side
} from './calculation/plan';
import {newPosition, Position, sortModifiers} from './calculation/position';
import {Range} from './calculation/range';
import {fileName, saveFile} from './download';
import {LanguageStore} from './language-store';
import {readStored, writeStored} from './storage';

/** Kleinster erlaubter Wert je Rahmenbedingung: ohne Tag kein Lager, ohne Leiter geht es zur Not. */
export const RANGE_MIN: Record<AdjustableType, number> = {days: 1, leaders: 0};

/** Wo ein gelöschtes Element stand, damit es sich an derselben Stelle wieder einfügen lässt. */
export interface Removed<T> {
  item: T;
  index: number;
}

/**
 * Hält den Plan, ist die einzige Stelle, die ihn verändert, und speichert jede Änderung im Browser.
 *
 * Der Plan ist unveränderlich: Jede Methode ersetzt ihn durch einen neuen, in dem nur der geänderte Teil neu ist.
 * Städte und Positionen werden über ihre ID angesprochen.
 */
@Injectable({providedIn: 'root'})
export class PlanStore {

  private static readonly STORAGE_KEY = 'camp-plan';

  /** Für die Namen neuer Städte und Positionen. */
  private readonly messages = inject(LanguageStore).messages;

  private readonly planSignal = signal<Plan>(this.stored());
  readonly plan = this.planSignal.asReadonly();

  readonly name = computed((): string => this.plan().name);

  /** Zeigt alle Beträge pro Teilnehmer statt als Gesamtsumme. */
  readonly perParticipant = signal<boolean>(false);

  /** Der Plan im Dateiformat, für Speicher und Datei. */
  readonly data = computed((): PlanData => planToData(this.plan()));

  constructor() {
    // Als Effekt: Mehrere Änderungen in einem Zug werden nur einmal gespeichert
    effect((): void => writeStored(PlanStore.STORAGE_KEY, dataToJson(this.data())));
  }

  // Rahmenbedingungen und Städte

  setRange(type: AdjustableType, bound: keyof Range, value: number): void {
    if (Number.isFinite(value)) {
      this.update((plan: Plan): Plan => ({...plan, [type]: withBound(plan[type], bound, value, RANGE_MIN[type])}));
    }
  }

  setCityName(id: string, name: string): void {
    this.updateCity(id, (city: City): City => city.others ? city : {...city, name});
  }

  setCityRange(id: string, bound: keyof Range, value: number): void {
    if (Number.isFinite(value)) {
      this.updateCity(id, (city: City): City =>
        ({...city, participants: withBound(city.participants, bound, value, 0)}));
    }
  }

  /** Fügt eine Stadt vor „Sonstige“ ein. */
  addCity(): void {
    this.insertCity(newCity(this.messages().cities.newCity, {start: 0, end: 10}), Infinity);
  }

  /** Positionen mit einem Faktor „pro Teilnehmer aus …“ für diese Stadt; solange es welche gibt, bleibt sie. */
  usersOf(id: string): Position[] {
    return positionsOf(this.plan()).filter((position: Position): boolean => position.modifiers
      .some((modifier: Modifier): boolean => modifier.kind === 'city' && modifier.city === id));
  }

  /** „Sonstige“ bleibt immer; das Ergebnis lässt sich mit {@link restoreCity} wieder einfügen. */
  removeCity(id: string): Removed<City> | null {
    const index: number = this.plan().cities.findIndex((city: City): boolean => city.id === id && !city.others);
    if (index < 0) {
      return null;
    }
    const item: City = this.plan().cities[index];
    this.update((plan: Plan): Plan => ({...plan, cities: plan.cities.filter((city: City): boolean => city.id !== id)}));
    return {item, index};
  }

  restoreCity({item, index}: Removed<City>): void {
    this.insertCity(item, index);
  }

  // Positionen und Faktoren

  setTitle(id: string, title: string): void {
    this.updatePosition(id, (position: Position): Position => ({...position, title}));
  }

  setAmount(id: string, amount: number | null): void {
    this.updatePosition(id, (position: Position): Position => ({...position, amount: amount ?? 0}));
  }

  /** `index`: die Stelle des Faktors in der Position. */
  setGroupSize(id: string, index: number, groupSize: number | null): void {
    this.updateModifier(id, index, (modifier: Modifier): Modifier =>
      'groupSize' in modifier ? {...modifier, groupSize: groupSize ?? 0} : modifier);
  }

  setCity(id: string, index: number, city: string): void {
    this.updateModifier(id, index, (modifier: Modifier): Modifier =>
      modifier.kind === 'city' ? {...modifier, city} : modifier);
  }

  addModifier(id: string, modifier: Modifier): void {
    this.updatePosition(id, (position: Position): Position =>
      ({...position, modifiers: sortModifiers([...position.modifiers, modifier])}));
  }

  removeModifier(id: string, index: number): void {
    this.updatePosition(id, (position: Position): Position =>
      ({...position, modifiers: position.modifiers.filter((_: Modifier, i: number): boolean => i !== index)}));
  }

  addPosition(side: Side): void {
    this.update((plan: Plan): Plan =>
      ({...plan, [side]: [...plan[side], newPosition(this.messages().positions.newPosition, 0)]}));
  }

  /** Das Ergebnis lässt sich mit {@link restorePosition} wieder einfügen. */
  removePosition(side: Side, id: string): Removed<Position> | null {
    const index: number = this.plan()[side].findIndex((position: Position): boolean => position.id === id);
    if (index < 0) {
      return null;
    }
    const item: Position = this.plan()[side][index];
    this.update((plan: Plan): Plan =>
      ({...plan, [side]: plan[side].filter((position: Position): boolean => position.id !== id)}));
    return {item, index};
  }

  restorePosition(side: Side, {item, index}: Removed<Position>): void {
    this.update((plan: Plan): Plan => ({...plan, [side]: inserted(plan[side], item, index)}));
  }

  // Ganzer Plan

  rename(name: string): void {
    this.update((plan: Plan): Plan => ({...plan, name}));
  }

  download(): void {
    saveFile(new Blob([dataToJson(this.data())], {type: 'application/json'}), fileName(this.plan().name, 'json'));
  }

  async open(file: File): Promise<void> {
    this.load(await file.text());
  }

  load(json: string): void {
    this.planSignal.set(planFromJson(json));
  }

  /** Setzt einen früheren Stand wieder ein, etwa um ein Zurücksetzen rückgängig zu machen. */
  restore(plan: Plan): void {
    this.planSignal.set(plan);
  }

  reset(): void {
    this.planSignal.set(defaultPlan());
  }

  /** Ersetzt den Plan durch einen leeren und setzt die Ansichtseinstellungen zurück. */
  clear(): void {
    this.perParticipant.set(false);
    this.planSignal.set(emptyPlan());
  }

  private update(change: (plan: Plan) => Plan): void {
    this.planSignal.update(change);
  }

  private updateCity(id: string, change: (city: City) => City): void {
    this.update((plan: Plan): Plan =>
      ({...plan, cities: plan.cities.map((city: City): City => city.id === id ? change(city) : city)}));
  }

  /** Vor „Sonstige“, das immer am Ende bleibt. */
  private insertCity(city: City, index: number): void {
    this.update((plan: Plan): Plan =>
      ({...plan, cities: inserted(plan.cities, city, Math.min(index, plan.cities.length - 1))}));
  }

  private updatePosition(id: string, change: (position: Position) => Position): void {
    // Die andere Seite bleibt dasselbe Array
    const apply = (positions: readonly Position[]): readonly Position[] =>
      positions.some((position: Position): boolean => position.id === id)
        ? positions.map((position: Position): Position => position.id === id ? change(position) : position)
        : positions;
    this.update((plan: Plan): Plan => ({...plan, debit: apply(plan.debit), credit: apply(plan.credit)}));
  }

  private updateModifier(id: string, index: number, change: (modifier: Modifier) => Modifier): void {
    this.updatePosition(id, (position: Position): Position => ({
      ...position,
      modifiers: position.modifiers.map((modifier: Modifier, i: number): Modifier =>
        i === index ? change(modifier) : modifier),
    }));
  }

  /** Der Stand vom letzten Besuch, sonst der Beispielplan. */
  private stored(): Plan {
    const json: string | null = readStored(PlanStore.STORAGE_KEY);
    if (json) {
      try {
        return planFromJson(json);
      } catch {
        // Defekter Speicher: mit dem Beispielplan starten.
      }
    }
    return defaultPlan();
  }
}

/** Ganze Zahl ab `min`; die andere Grenze rückt mit, damit der Bereich gültig bleibt. */
function withBound(range: Range, bound: keyof Range, value: number, min: number): Range {
  const next: number = Math.max(min, Math.round(value));
  return bound === 'start'
    ? {start: next, end: Math.max(next, range.end)}
    : {start: Math.min(next, range.start), end: next};
}

function inserted<T>(items: readonly T[], item: T, index: number): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}
