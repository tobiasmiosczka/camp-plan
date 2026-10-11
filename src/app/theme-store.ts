import {inject, Injectable, signal} from '@angular/core';
import {MediaMatcher} from '@angular/cdk/layout';

@Injectable({providedIn: 'root'})
export class ThemeStore {

  private static readonly STORAGE_KEY = 'camp-plan-theme';

  /** Über die CDK: Ohne Browser (Tests, Server) liefert sie eine Abfrage, die nie zutrifft, statt zu scheitern. */
  private readonly system: MediaQueryList = inject(MediaMatcher).matchMedia('(prefers-color-scheme: dark)');
  /** Ausdrückliche Wahl; null heißt: wie das Betriebssystem (Material-Design-Standard). */
  private choice: boolean | null = this.restore();
  private readonly darkSignal = signal<boolean>(this.choice ?? this.system.matches);

  /** Dunkles Farbschema aktiv – gewählt oder vom System übernommen. */
  readonly dark = this.darkSignal.asReadonly();

  constructor() {
    this.apply();
    // addListener statt addEventListener: Nur das kennt auch die Ersatz-Abfrage der CDK
    this.system.addListener((): void => {
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
    const dark: boolean = this.choice ?? this.system.matches;
    // Erst das DOM umstellen, damit Effekte, die auf das Signal reagieren, schon die neuen Farben auslesen
    document.body.style.colorScheme = dark ? 'dark' : 'light';
    this.darkSignal.set(dark);
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
