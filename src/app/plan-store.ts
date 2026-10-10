import {Injectable, linkedSignal, signal} from '@angular/core';
import {defaultPlan, emptyPlan, Plan, planFromJson, planToJson} from './calculation/plan';

@Injectable({providedIn: 'root'})
export class PlanStore {

  private static readonly STORAGE_KEY = 'camp-plan';

  readonly plan = signal<Plan>(this.restore());

  /**
   * Projektname als eigenes Signal: Umbenennen soll Titel und Anzeige aktualisieren, aber keine neue Rechnung
   * auslösen. Folgt automatisch, wenn ein anderer Plan geladen wird.
   */
  readonly name = linkedSignal<string>((): string => this.plan().name);

  /** Zeigt alle Beträge pro Teilnehmer statt als Gesamtsumme. */
  readonly perParticipant = signal<boolean>(false);

  /** Speichert den aktuellen Stand im Browser, damit er ein Neuladen übersteht. */
  autosave(): void {
    try {
      localStorage.setItem(PlanStore.STORAGE_KEY, planToJson(this.plan()));
    } catch {
      // Ohne Browser-Speicher (z. B. privater Modus) geht nur das automatische Zwischenspeichern verloren.
    }
  }

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
