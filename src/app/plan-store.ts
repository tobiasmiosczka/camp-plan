import {Injectable, linkedSignal, signal} from '@angular/core';
import {defaultPlan, emptyPlan, Plan, planFromJson, planToJson} from './calculation/plan';
import {City, ContextType, GroupModifier, PerCityModifier, Position, PositionModifier, Range} from './calculation/position';

/** Kontoseite einer Position. */
export type Side = 'debit' | 'credit';

/** Kleinster erlaubter Wert je Rahmenbedingung: ohne Tag kein Lager, ohne Leiter geht es zur Not. */
export const RANGE_MIN: Record<ContextType.DAYS | ContextType.LEADERS, number> = {
  [ContextType.DAYS]: 1,
  [ContextType.LEADERS]: 0,
};

/**
 * Hält den Plan und ist die einzige Stelle, die ihn verändert.
 *
 * Das Modell wird an Ort und Stelle geändert, damit Positionen und Städte ihre Identität behalten (Faktoren verweisen
 * auf Städte, Ergebnisse auf Positionen). Kein Signal bemerkt eine solche Änderung; deshalb zählt jede Methode hier
 * {@link revision} hoch. Komponenten ändern das Modell nie selbst.
 */
@Injectable({providedIn: 'root'})
export class PlanStore {

  private static readonly STORAGE_KEY = 'camp-plan';

  readonly plan = signal<Plan>(this.restore());

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
    this.plan().contextRange.addCity(new City('Neue Stadt', {start: 0, end: 10}));
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
    this.plan()[side].push(new Position('Neue Position', 0));
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
    this.autosave();
  }

  download(): void {
    const blob = new Blob([planToJson(this.plan())], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(this.plan().name, 'json');
    link.click();
    URL.revokeObjectURL(url);
  }

  async open(file: File): Promise<void> {
    this.load(await file.text());
  }

  load(json: string): void {
    this.plan.set(planFromJson(json));
    this.autosave();
  }

  reset(): void {
    this.plan.set(defaultPlan());
    this.autosave();
  }

  /** Löscht den gespeicherten Stand, alle Positionen und Städte sowie die Ansichtseinstellungen. */
  clear(): void {
    try {
      localStorage.removeItem(PlanStore.STORAGE_KEY);
    } catch {
      // Nichts gespeichert, nichts zu löschen.
    }
    this.perParticipant.set(false);
    this.plan.set(emptyPlan());
  }

  /** Speichert den aktuellen Stand im Browser, damit er ein Neuladen übersteht. */
  private autosave(): void {
    try {
      localStorage.setItem(PlanStore.STORAGE_KEY, planToJson(this.plan()));
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
    this.autosave();
  }

  private restore(): Plan {
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

/** Dateiname aus Projektname und Datum, z. B. „sommerlager-2027-2026-10-09.pdf“; ohne Namen „camp-plan-…“. */
export function fileName(projectName: string, extension: string): string {
  const slug: string = projectName
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    // Lange Namen an einer Wortgrenze kürzen, damit Dateinamen handlich bleiben
    .replace(/^(.{1,60})(-.*)?$/, '$1')
    .slice(0, 60);
  return `${slug || 'camp-plan'}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
