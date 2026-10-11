import {ApplicationRef} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {PlanCalculation} from './plan-calculation';
import {PlanStore} from './plan-store';
import {CalculationRunner} from './calculation-runner';

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

describe('PlanCalculation', () => {
  let store: PlanStore;
  let calculation: PlanCalculation;
  let runs: number;
  const settle = (): Promise<void> => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    store = TestBed.inject(PlanStore);
    const runner = TestBed.inject(CalculationRunner);
    const run = runner.run.bind(runner);
    runs = 0;
    vi.spyOn(runner, 'run').mockImplementation((...args) => {
      runs++;
      return run(...args);
    });
    calculation = TestBed.inject(PlanCalculation);
    await settle();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('calculates the plan and maps the results back to its positions', () => {
    const result = calculation.result()!;
    const plan = store.plan();

    expect(result.results.scenarioCount).toBe(15498);
    expect(result.positionSums.get(plan.debit[1])).toEqual({min: 654.5, max: 654.5});
    expect(calculation.skeleton()).toBe(false);
  });

  it('calculates again when a number changes', async () => {
    const first = calculation.result()!;

    store.setAmount(store.plan().debit[1], 700);
    await settle();

    expect(calculation.result()).not.toBe(first);
    expect(calculation.result()!.positionSums.get(store.plan().debit[1])).toEqual({min: 700, max: 700});
  });

  it('does not calculate again for renaming', async () => {
    const before = runs;

    store.setTitle(store.plan().debit[1], 'Turnhalle');
    store.setCityName(store.plan().contextRange.getCities()[0], 'Stadt A');
    store.rename('Sommerlager');
    await settle();

    expect(runs).toBe(before);
  });

  it('calculates again for the per-participant view', async () => {
    const before = runs;

    store.perParticipant.set(true);
    await settle();

    expect(runs).toBe(before + 1);
    expect(calculation.result()!.calculation.balance.max).toBeLessThan(200);
  });
});
