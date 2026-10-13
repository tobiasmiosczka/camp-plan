import {TestBed} from '@angular/core/testing';
import {ContextType} from './calculation/position';
import {fileName, PlanStore} from './plan-store';
import {useTestPlan} from './testing/test-plan';

describe('PlanStore', () => {
  let store: PlanStore;

  beforeEach(() => {
    store = TestBed.inject(PlanStore);
    useTestPlan();
  });

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
    const position = positions[0];

    const index = store.removePosition('credit', position);
    expect(positions).not.toContain(position);

    store.restorePosition('credit', position, index);
    expect(positions[0]).toBe(position);
  });

  it('knows which positions still use a city', () => {
    const [aachen, , others] = store.plan().contextRange.getCities();

    expect(store.usersOf(aachen).map(position => position.getTitle())).toEqual(['Zuschuss Aachen']);
    expect(store.usersOf(others)).toEqual([]);
  });

  it('saves every change for the next visit, several at once only once', () => {
    TestBed.tick();
    const setItem = vi.spyOn(localStorage, 'setItem');

    store.setAmount(store.plan().debit[0], 9);
    store.setTitle(store.plan().debit[0], 'Essen');
    TestBed.tick();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('camp-plan')).toContain('"amount": 9');
  });

  it('hands out the plan as data that later changes leave alone', () => {
    const data = store.data();

    store.setRange(ContextType.DAYS, 'end', 9);

    expect(data.days.end).toBe(2);
    expect(store.data().days.end).toBe(9);
  });
});

describe('fileName', () => {
  const date: string = new Date().toISOString().slice(0, 10);

  it('turns the project name into a slug with the date', () => {
    expect(fileName('  Sommerlager Hünxe/Wesel!  ', 'pdf')).toBe(`sommerlager-huenxe-wesel-${date}.pdf`);
    expect(fileName('', 'json')).toBe(`camp-plan-${date}.json`);
  });

  it('shortens long names at a word boundary, or hard without one', () => {
    const words: string = 'Ein sehr langer Projektname der weit über sechzig Zeichen hinausgeht';
    expect(fileName(words, 'pdf')).toBe(`ein-sehr-langer-projektname-der-weit-ueber-sechzig-zeichen-${date}.pdf`);
    expect(fileName('x'.repeat(80), 'pdf')).toBe(`${'x'.repeat(60)}-${date}.pdf`);
  });
});
