import { TestBed } from '@angular/core/testing';
import { LanguageStore } from './language-store';

describe('LanguageStore', () => {
  const browser = (...languages: string[]): void => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  };

  it('follows the first browser language it knows', () => {
    browser('fr-FR', 'en-GB', 'de');
    expect(TestBed.inject(LanguageStore).language()).toBe('en');
  });

  it('falls back to English for unknown browser languages', () => {
    browser('fr-FR');
    expect(TestBed.inject(LanguageStore).language()).toBe('en');
  });

  it('remembers a chosen language and marks the page with it', () => {
    TestBed.inject(LanguageStore).setLanguage('en');

    expect(document.documentElement.lang).toBe('en');
    TestBed.resetTestingModule();
    const store = TestBed.inject(LanguageStore);
    expect(store.language()).toBe('en');
    expect(store.messages().topBar.open).toBe('Open plan');
  });

  it('forgets the choice on reset and follows the browser again', () => {
    const store = TestBed.inject(LanguageStore);
    store.setLanguage('en');

    store.reset();

    expect(store.language()).toBe('de');
    expect(localStorage.getItem('camp-plan-language')).toBeNull();
  });
});
