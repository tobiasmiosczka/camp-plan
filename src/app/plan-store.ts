import {computed, effect, inject, Injectable, linkedSignal, signal} from '@angular/core';
import {
  dataToJson, defaultPlan, emptyPlan, Plan, PlanData, planFromData, planFromJson, planToData
} from './calculation/plan';
import {City} from './calculation/city';
import {ContextType} from './calculation/context';
import {GroupModifier, PerCityModifier, PositionModifier} from './calculation/modifiers';
import {Position} from './calculation/position';
import {Range} from './calculation/range';
import {fileName, saveFile} from './download';
import {LanguageStore} from './language-store';

/** Kontoseite einer Position. */
export type Side = 'debit' | 'credit';

/** Kleinster erlaubter Wert je Rahmenbedingung: ohne Tag kein Lager, ohne Leiter geht es zur Not. */
export const RANGE_MIN: Record<ContextType.DAYS | ContextType.LEADERS, number> = {
  [ContextType.DAYS]: 1,
  [ContextType.LEADERS]: 0,
};

/**
 * Hält den Plan, ist die einzige Stelle, die ihn verändert, und speichert jede Änderung im Browser.
 *
 * Das Modell wird an Ort und Stelle geändert, damit Positionen und Städte ihre Identität behalten (Faktoren verweisen
 * auf Städte, Ergebnisse auf Positionen). Kein Signal bemerkt eine solche Änderung; deshalb zählt jede Methode hier
 * {@link revision} hoch. Komponenten ändern das Modell nie selbst.
 */
@Injectable({providedIn: 'root'})
export class PlanStore {

  private static readonly STORAGE_KEY = 'camp-plan';

  /** Für die Namen neuer Städte und Positionen. */
  private readonly messages = inject(LanguageStore).messages;

  readonly plan = signal<Plan>(this.stored());

  private readonly revisionSignal = signal<number>(0);
  /** Zählt jede Änderung am geladenen Plan. */
  readonly revision = this.revisionSignal.asReadonly();

  private readonly labelsSignal = signal<number>(0);
  /** Zählt nur umbenannte Städte: Diagramme zeigen ihre Namen, rechnen muss dafür niemand. */
  readonly labels = this.labelsSignal.asReadonly();

  /**
   * Projektname als eigenes Signal: Umbenennen soll Titel und Anzeige aktualisieren, aber keine neue Rechnung
   * auslösen. Folgt automatisch, wenn ein anderer Plan geladen wird.
   */
  readonly name = linkedSignal<string>((): string => this.plan().name);

  /** Zeigt alle Beträge pro Teilnehmer statt als Gesamtsumme. */
  readonly perParticipant = signal<boolean>(false);

  /** Der Plan als reine Daten, einmal je Änderung erzeugt: für Speicher, Datei und Rechnung. */
  readonly data = computed((): PlanData => {
    this.revision();
    this.name();
    return planToData(this.plan());
  });

  constructor() {
    // Als Effekt: Mehrere Änderungen in einem Zug werden nur einmal gespeichert
    effect((): void => this.save(this.data()));
  }

  // Rahmenbedingungen und Städte

  setRange(type: ContextType.DAYS | ContextType.LEADERS, bound: keyof Range, value: number): void {
    this.setBound(this.plan().contextRange.get(type), bound, value, RANGE_MIN[type]);
  }

  setCityName(city: City, name: string): void {
    city.setName(name);
    this.labelsSignal.update((labels: number): number => labels + 1);
    this.changed();
  }

  setCityRange(city: City, bound: keyof Range, value: number): void {
    this.setBound(city.getParticipants(), bound, value, 0);
  }

  addCity(): void {
    this.plan().contextRange.addCity(new City(this.messages().cities.newCity, {start: 0, end: 10}));
    this.changed();
  }

  /** Positionen mit einem Faktor „pro Teilnehmer aus …“ für diese Stadt; solange es welche gibt, bleibt sie. */
  usersOf(city: City): Position[] {
    const plan: Plan = this.plan();
    return [...plan.debit, ...plan.credit].filter((position: Position): boolean => position.getModifiers()
      .some((modifier: PositionModifier): boolean => modifier instanceof PerCityModifier && modifier.getCity() === city));
  }

  /** Gibt die bisherige Stelle zurück, damit sich das Löschen mit {@link restoreCity} rückgängig machen lässt. */
  removeCity(city: City): number {
    const index: number = this.plan().contextRange.removeCity(city);
    this.changed();
    return index;
  }

  restoreCity(city: City, index: number): void {
    this.plan().contextRange.addCity(city, index);
    this.changed();
  }

  // Positionen und Faktoren

  setTitle(position: Position, title: string): void {
    position.setTitle(title);
    this.changed();
  }

  setAmount(position: Position, amount: number | null): void {
    position.setAmount(amount ?? 0);
    this.changed();
  }

  setGroupSize(modifier: GroupModifier, groupSize: number | null): void {
    modifier.setGroupSize(groupSize ?? 0);
    this.changed();
  }

  setCity(modifier: PerCityModifier, city: City): void {
    modifier.setCity(city);
    this.changed();
  }

  addModifier(position: Position, modifier: PositionModifier): void {
    position.addModifier(modifier);
    this.changed();
  }

  removeModifier(position: Position, modifier: PositionModifier): void {
    position.removeModifier(modifier);
    this.changed();
  }

  addPosition(side: Side): void {
    this.plan()[side].push(new Position(this.messages().positions.newPosition, 0));
    this.changed();
  }

  /** Gibt die bisherige Stelle zurück, damit sich das Löschen mit {@link restorePosition} rückgängig machen lässt. */
  removePosition(side: Side, position: Position): number {
    const positions: Position[] = this.plan()[side];
    const index: number = positions.indexOf(position);
    if (index >= 0) {
      positions.splice(index, 1);
      this.changed();
    }
    return index;
  }

  restorePosition(side: Side, position: Position, index: number): void {
    const positions: Position[] = this.plan()[side];
    positions.splice(Math.min(index, positions.length), 0, position);
    this.changed();
  }

  // Ganzer Plan

  rename(name: string): void {
    this.plan().name = name;
    this.name.set(name);
  }

  download(): void {
    saveFile(new Blob([dataToJson(this.data())], {type: 'application/json'}), fileName(this.plan().name, 'json'));
  }

  async open(file: File): Promise<void> {
    this.load(await file.text());
  }

  load(json: string): void {
    this.plan.set(planFromJson(json));
  }

  /** Lädt einen Stand aus {@link data} wieder, etwa um ein Zurücksetzen rückgängig zu machen. */
  restore(data: PlanData): void {
    this.plan.set(planFromData(data));
  }

  reset(): void {
    this.plan.set(defaultPlan());
  }

  /** Ersetzt den Plan durch einen leeren und setzt die Ansichtseinstellungen zurück. */
  clear(): void {
    this.perParticipant.set(false);
    this.plan.set(emptyPlan());
  }

  /** Speichert den aktuellen Stand im Browser, damit er ein Neuladen übersteht. */
  private save(data: PlanData): void {
    try {
      localStorage.setItem(PlanStore.STORAGE_KEY, dataToJson(data));
    } catch {
      // Ohne Browser-Speicher (z. B. privater Modus) geht nur das automatische Zwischenspeichern verloren.
    }
  }

  /** Ganze Zahl ab `min`; die andere Grenze rückt mit, damit der Bereich gültig bleibt. */
  private setBound(range: Range, bound: keyof Range, value: number, min: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    range[bound] = Math.max(min, Math.round(value));
    if (range.start > range.end) {
      if (bound === 'start') {
        range.end = range.start;
      } else {
        range.start = range.end;
      }
    }
    this.changed();
  }

  private changed(): void {
    this.revisionSignal.update((revision: number): number => revision + 1);
  }

  /** Der Stand vom letzten Besuch, sonst der Beispielplan. */
  private stored(): Plan {
    try {
      const json = localStorage.getItem(PlanStore.STORAGE_KEY);
      if (json) {
        return planFromJson(json);
      }
    } catch {
      // Defekter oder nicht verfügbarer Speicher: mit dem Beispielplan starten.
    }
    return defaultPlan();
  }
}
