import {Injectable, signal} from '@angular/core';
import {defaultPlan, emptyPlan, Plan, planFromJson, planToJson} from './calculation/plan';

@Injectable({providedIn: 'root'})
export class PlanStore {

  private static readonly STORAGE_KEY = 'camp-plan';

  readonly plan = signal<Plan>(this.restore());

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

  download(): void {
    const blob = new Blob([planToJson(this.plan())], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `camp-plan-${new Date().toISOString().slice(0, 10)}.json`;
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
