import {computed, Injectable, Signal, signal} from '@angular/core';
import {DE, Messages} from './i18n/de';
import {EN} from './i18n/en';
import {readStored, removeStored, writeStored} from './storage';

export type Language = 'de' | 'en';

/** Alle Sprachen der App, in der Reihenfolge der Sprachauswahl. */
export const LANGUAGES: Record<Language, Messages> = {de: DE, en: EN};

/**
 * Die Sprache der Oberfläche: ausdrücklich gewählt oder vom Browser übernommen. Umschalten wirkt sofort, ohne
 * Neuladen: Komponenten lesen ihre Texte aus {@link messages}.
 */
@Injectable({providedIn: 'root'})
export class LanguageStore {

  private static readonly STORAGE_KEY = 'camp-plan-language';

  private readonly languageSignal = signal<Language>(this.restore() ?? browserLanguage());

  readonly language: Signal<Language> = this.languageSignal.asReadonly();

  /** Alle Texte der aktuellen Sprache; in Templates als `t()`. */
  readonly messages: Signal<Messages> = computed((): Messages => LANGUAGES[this.language()]);

  constructor() {
    this.apply();
  }

  setLanguage(language: Language): void {
    this.languageSignal.set(language);
    this.apply();
    writeStored(LanguageStore.STORAGE_KEY, language);
  }

  /** Vergisst die gespeicherte Wahl und folgt wieder dem Browser. */
  reset(): void {
    removeStored(LanguageStore.STORAGE_KEY);
    this.languageSignal.set(browserLanguage());
    this.apply();
  }

  /** Screenreader und Silbentrennung richten sich nach dem lang-Attribut der Seite. */
  private apply(): void {
    document.documentElement.lang = this.language();
  }

  private restore(): Language | null {
    const stored: string | null = readStored(LanguageStore.STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  }
}

function isLanguage(value: string | null): value is Language {
  return value !== null && Object.hasOwn(LANGUAGES, value);
}

/** Die erste bevorzugte Sprache des Browsers, die die App kennt; sonst Englisch. */
function browserLanguage(): Language {
  const preferred: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  for (const tag of preferred) {
    const base: string = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) {
      return base;
    }
  }
  return 'en';
}
