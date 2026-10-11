import {TestBed} from '@angular/core/testing';
import {ContextType} from './calculation/position';
import {PlanStore} from './plan-store';

/** Node stellt unter jsdom kein nutzbares localStorage bereit. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('PlanStore', () => {
  let store: PlanStore;

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    store = TestBed.inject(PlanStore);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('counts every change to the plan', () => {
    const position = store.plan().debit[0];
    const before = store.revision();

    store.setAmount(position, 8);
    store.setTitle(position, 'Essen');
    store.addPosition('credit');

    expect(store.revision()).toBe(before + 3);
    expect(position.getAmount()).toBe(8);
  });

  it('counts renamed cities separately, because only the charts need to know', () => {
    const city = store.plan().contextRange.getCities()[0];
    const labels = store.labels();

    store.setCityName(city, 'Stadt A');

    expect(store.labels()).toBe(labels + 1);
  });

  it('keeps ranges whole, above their minimum and in order', () => {
    store.setRange(ContextType.DAYS, 'start', 0);
    expect(store.plan().contextRange.get(ContextType.DAYS).start).toBe(1);

    store.setRange(ContextType.LEADERS, 'start', 12.4);
    expect(store.plan().contextRange.get(ContextType.LEADERS)).toEqual({start: 12, end: 12});

    const revision = store.revision();
    store.setRange(ContextType.LEADERS, 'end', NaN);
    expect(store.revision()).toBe(revision);
  });

  it('restores a removed position at its old place', () => {
    const positions = store.plan().credit;
    const position = positions[2];

    const index = store.removePosition('credit', position);
    expect(positions).not.toContain(position);

    store.restorePosition('credit', position, index);
    expect(positions[2]).toBe(position);
  });

  it('knows which positions still use a city', () => {
    const [dinslaken, , , others] = store.plan().contextRange.getCities();

    expect(store.usersOf(dinslaken).map(position => position.getTitle())).toEqual(['Förderung Teilnehmer Dinslaken']);
    expect(store.usersOf(others)).toEqual([]);
  });

  it('saves every change for the next visit', () => {
    store.setAmount(store.plan().debit[0], 9);

    expect(localStorage.getItem('camp-plan')).toContain('"amount": 9');
  });
});
