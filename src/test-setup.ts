/** Node stellt unter jsdom kein nutzbares localStorage bereit; jeder Test bekommt einen frischen Speicher. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length(): number {
      return items.size;
    },
    clear: (): void => items.clear(),
    getItem: (key: string): string | null => items.get(key) ?? null,
    key: (index: number): string | null => [...items.keys()][index] ?? null,
    removeItem: (key: string): void => {
      items.delete(key);
    },
    setItem: (key: string, value: string): void => {
      items.set(key, value);
    },
  };
}

beforeEach((): void => {
  vi.stubGlobal('localStorage', memoryStorage());
  // jsdom meldet einen englischen Browser; die Tests prüfen die deutschen Texte, solange sie nichts anderes wählen
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
});

afterEach((): void => {
  vi.unstubAllGlobals();
});
