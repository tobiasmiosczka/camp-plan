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
    removeItem: (key: string): void => void items.delete(key),
    setItem: (key: string, value: string): void => void items.set(key, value),
  };
}

beforeEach((): void => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach((): void => {
  vi.unstubAllGlobals();
});
