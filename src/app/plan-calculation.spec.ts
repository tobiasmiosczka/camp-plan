import {ApplicationRef} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {PlanCalculation} from './plan-calculation';
import {PlanStore} from './plan-store';
import {CalculationRunner} from './calculation-runner';
import {useTestPlan} from './testing/test-plan';

describe('PlanCalculation', () => {
  let store: PlanStore;
  let calculation: PlanCalculation;
  let runs: number;
  let runner: CalculationRunner;
  /** Die echte Rechnung, bevor der Test sie beobachtet. */
  let original: CalculationRunner['run'];
  const settle = (): Promise<void> => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(async () => {
    store = TestBed.inject(PlanStore);
    useTestPlan();
    runner = TestBed.inject(CalculationRunner);
    original = runner.run.bind(runner);
    runs = 0;
    vi.spyOn(runner, 'run').mockImplementation((...args) => {
      runs++;
      return original(...args);
    });
    calculation = TestBed.inject(PlanCalculation);
    await settle();
  });

  it('calculates the plan and maps the results back to its positions', () => {
    const result = calculation.result()!;
    const plan = store.plan();

    expect(result.results.scenarioCount).toBe(6);
    expect(result.positionSums.get(plan.debit[0].id)).toEqual({min: 100, max: 100});
    expect(result.positionSums.get(plan.debit[1].id)).toEqual({min: 40, max: 100});
    expect(calculation.skeleton()).toBe(false);
  });

  it('calculates again when a number changes', async () => {
    const first = calculation.result()!;

    store.setAmount(store.plan().debit[0].id, 700);
    await settle();

    expect(calculation.result()).not.toBe(first);
    expect(calculation.result()!.positionSums.get(store.plan().debit[0].id)).toEqual({min: 700, max: 700});
  });

  it('does not calculate again for renaming', async () => {
    const before = runs;

    store.setTitle(store.plan().debit[0].id, 'Turnhalle');
    store.setCityName(store.plan().cities[0].id, 'Stadt A');
    store.rename('Sommerlager');
    await settle();

    expect(runs).toBe(before);
  });

  it('hands out the result of the latest change, even right after it', async () => {
    const before = await calculation.latest();

    store.setAmount(store.plan().debit[0].id, 700);
    const after = await calculation.latest();

    expect(after).not.toBe(before);
    expect(after.positionSums.get(store.plan().debit[0].id)).toEqual({min: 700, max: 700});
  });

  it('shows no progress for a quick calculation', async () => {
    store.setAmount(store.plan().debit[0].id, 700);
    await settle();

    expect(calculation.progress()).toBeNull();
  });

  it('shows the progress of a long calculation and hides it when done', async () => {
    let finish!: () => void;
    let report!: (share: number) => void;
    vi.mocked(runner.run).mockImplementationOnce((plan, perParticipant, abortSignal, onProgress) => {
      report = onProgress!;
      return new Promise(resolve => finish = () => resolve(original(plan, perParticipant)));
    });
    const now = vi.spyOn(performance, 'now');

    store.setAmount(store.plan().debit[0].id, 700);
    // Nicht auf Stabilität warten: Die Rechnung hält der Test absichtlich an
    TestBed.tick();
    await vi.waitFor(() => expect(report).toBeDefined());
    now.mockReturnValue(performance.now() + 100);
    report(0.2);
    expect(calculation.progress()).toBeNull();

    now.mockReturnValue(Number.MAX_SAFE_INTEGER);
    report(0.6);
    expect(calculation.progress()).toBe(0.6);

    finish();
    await settle();
    expect(calculation.progress()).toBeNull();
    now.mockRestore();
  });

  it('calculates again for the per-participant view', async () => {
    const before = runs;

    store.perParticipant.set(true);
    await settle();

    expect(runs).toBe(before + 1);
    expect(calculation.result()!.calculation.balance.max).toBeLessThan(200);
  });
});
