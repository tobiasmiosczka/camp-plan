import {inject, Injectable, signal} from '@angular/core';
import {BreakpointObserver} from '@angular/cdk/layout';

@Injectable({providedIn: 'root'})
export class ThemeStore {

  private static readonly STORAGE_KEY = 'camp-plan-theme';
  private static readonly SYSTEM_DARK = '(prefers-color-scheme: dark)';

  /** Über die CDK: Ohne Browser (Tests, Server) trifft die Abfrage nie zu, statt zu scheitern. */
  private readonly breakpoints = inject(BreakpointObserver);
  /** Ausdrückliche Wahl; null heißt: wie das Betriebssystem (Material-Design-Standard). */
  private choice: boolean | null = this.restore();
  private readonly darkSignal = signal<boolean>(this.choice ?? this.systemDark());

  /** Dunkles Farbschema aktiv – gewählt oder vom System übernommen. */
  readonly dark = this.darkSignal.asReadonly();

  constructor() {
    this.apply();
    // Der Store lebt so lange wie die App; das Abonnement muss nie beendet werden
    this.breakpoints.observe(ThemeStore.SYSTEM_DARK).subscribe((): void => {
      if (this.choice === null) {
        this.apply();
      }
    });
  }

  setDark(dark: boolean): void {
    this.choice = dark;
    this.apply();
    try {
      localStorage.setItem(ThemeStore.STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Ohne Browser-Speicher gilt die Wahl nur bis zum Neuladen.
    }
  }

  /** Vergisst die gespeicherte Wahl und folgt wieder dem Betriebssystem. */
  reset(): void {
    this.choice = null;
    this.apply();
    try {
      localStorage.removeItem(ThemeStore.STORAGE_KEY);
    } catch {
      // Nichts gespeichert, nichts zu löschen.
    }
  }

  private apply(): void {
    const dark: boolean = this.choice ?? this.systemDark();
    // Erst das DOM umstellen, damit Effekte, die auf das Signal reagieren, schon die neuen Farben auslesen
    document.body.style.colorScheme = dark ? 'dark' : 'light';
    this.darkSignal.set(dark);
  }

  private systemDark(): boolean {
    return this.breakpoints.isMatched(ThemeStore.SYSTEM_DARK);
  }

  private restore(): boolean | null {
    try {
      const stored: string | null = localStorage.getItem(ThemeStore.STORAGE_KEY);
      return stored === null ? null : stored === 'dark';
    } catch {
      return null;
    }
  }
}
