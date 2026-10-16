import {TestBed} from '@angular/core/testing';
import {PER_DAY} from './calculation/modifiers';
import {Plan} from './calculation/plan';
import {PlanStore} from './plan-store';
import {useTestPlan} from './testing/test-plan';

describe('PlanStore', () => {
  let store: PlanStore;

  beforeEach(() => {
    store = TestBed.inject(PlanStore);
    useTestPlan();
  });

  it('replaces the plan on every change and keeps what did not change', () => {
    const before: Plan = store.plan();
    const halle = before.debit[0];

    store.setAmount(halle.id, 8);
    store.setTitle(halle.id, 'Essen');

    const after: Plan = store.plan();
    expect(after).not.toBe(before);
    expect(after.debit[0]).toEqual({...halle, title: 'Essen', amount: 8});
    expect(halle.amount).toBe(100);
    expect(after.debit[1]).toBe(before.debit[1]);
    expect(after.credit).toBe(before.credit);
  });

  it('renames cities, but never „Sonstige“', () => {
    const [aachen, , others] = store.plan().cities;

    store.setCityName(aachen.id, 'Stadt A');
    store.setCityName(others.id, 'Andere');

    expect(store.plan().cities.map(city => city.name)).toEqual(['Stadt A', 'Bonn', 'Sonstige']);
  });

  it('keeps ranges whole, above their minimum and in order', () => {
    store.setRange('days', 'start', 0);
    expect(store.plan().days.start).toBe(1);

    store.setRange('leaders', 'start', 12.4);
    expect(store.plan().leaders).toEqual({start: 12, end: 12});

    const plan: Plan = store.plan();
    store.setRange('leaders', 'end', NaN);
    expect(store.plan()).toBe(plan);
  });

  it('edits modifiers by their place in the position', () => {
    const essen = store.plan().debit[1];

    store.addModifier(essen.id, {kind: 'personGroup', groupSize: 10});
    store.setGroupSize(essen.id, 2, 4);
    expect(store.plan().debit[1].modifiers).toEqual([...essen.modifiers, {kind: 'personGroup', groupSize: 4}]);

    store.removeModifier(essen.id, 1);
    expect(store.plan().debit[1].modifiers.map(modifier => modifier.kind)).toEqual(['person', 'personGroup']);
    expect(essen.modifiers).toContain(PER_DAY);
  });

  it('restores a removed position at its old place', () => {
    const position = store.plan().credit[0];

    const removed = store.removePosition('credit', position.id)!;
    expect(store.plan().credit).not.toContain(position);

    store.restorePosition('credit', removed);
    expect(store.plan().credit[0]).toBe(position);
  });

  it('adds and restores cities before „Sonstige“', () => {
    store.addCity();
    expect(store.plan().cities.map(city => city.others)).toEqual([false, false, false, true]);

    const bonn = store.plan().cities[1];
    const removed = store.removeCity(bonn.id)!;
    expect(store.plan().cities).not.toContain(bonn);
    expect(store.removeCity(store.plan().cities.at(-1)!.id)).toBeNull();

    store.restoreCity(removed);
    expect(store.plan().cities[1]).toBe(bonn);
  });

  it('knows which positions still use a city', () => {
    const [aachen, , others] = store.plan().cities;

    expect(store.usersOf(aachen.id).map(position => position.title)).toEqual(['Zuschuss Aachen']);
    expect(store.usersOf(others.id)).toEqual([]);
  });

  it('saves every change for the next visit, several at once only once', () => {
    TestBed.tick();
    const setItem = vi.spyOn(localStorage, 'setItem');

    store.setAmount(store.plan().debit[0].id, 9);
    store.setTitle(store.plan().debit[0].id, 'Essen');
    TestBed.tick();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('camp-plan')).toContain('"amount": 9');
  });

  it('takes back a reset', () => {
    const plan: Plan = store.plan();

    store.reset();
    expect(store.plan().name).not.toBe('Testlager');

    store.restore(plan);
    expect(store.plan()).toBe(plan);
  });
});
