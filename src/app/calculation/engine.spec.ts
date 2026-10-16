import {calculate} from './calculator';
import {calculationKey, evaluate, referencedCities, transferables} from './engine';
import {defaultPlan, Plan} from './plan';
import {newPosition} from './position';
import {enumerateScenarios, ScenarioResults} from './scenarios';

describe('evaluate', () => {
  it('returns the same numbers as calculating the plan directly', () => {
    const plan = defaultPlan();
    const result = evaluate(plan, false);
    const relevant = plan.cities.slice(0, 3).map(city => city.id);
    const expected = calculate(enumerateScenarios(plan, relevant), plan, false);

    expect(result.values).toEqual(expected.values);
    expect(result.balance).toEqual(expected.balance);
    expect(result.positionSums).toEqual(expected.positionSums);
  });

  it('lists scenarios as columns that resolve to the cities of the plan', () => {
    const plan = defaultPlan();
    const result = evaluate(plan, false);

    // Dinslaken, Voerde und Hünxe/Wesel haben eigene Förderungen, „Sonstige“ nicht
    expect(result.scenarios.relevant).toEqual(plan.cities.slice(0, 3).map(city => city.id));
    expect(referencedCities(plan)).toEqual(result.scenarios.relevant);
    const results = new ScenarioResults(result.scenarios, result.values, plan);
    expect(results.domain({kind: 'city', city: plan.cities[1].id})).toEqual([0, 1, 2]);
    expect(results.aggregate([{kind: 'type', type: 'days'}]).size).toBe(2);
  });

  it('hands over every column without copying', () => {
    const result = evaluate(defaultPlan(), false);

    expect(transferables(result).length).toBe(6 + result.scenarios.cities.length);
    expect(new Set(transferables(result)).size).toBe(transferables(result).length);
  });

  it('survives the way to the worker unchanged', () => {
    const plan = defaultPlan();

    expect(structuredClone(plan)).toEqual(plan);
  });
});

describe('evaluate progress', () => {
  it('reports a growing share up to the end of the calculation', () => {
    const plan = defaultPlan();
    // Groß genug für mehrere Meldungen je Phase
    const large: Plan = {...plan, cities: plan.cities.map((city, i) =>
      i === 1 ? {...city, participants: {start: 0, end: 100}} : city)};
    const shares: number[] = [];

    const result = evaluate(large, false, share => shares.push(share));

    expect(result.values.length).toBeGreaterThan(500_000);
    expect(shares.length).toBeGreaterThan(10);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
    expect(shares[0]).toBe(0);
    expect(shares.at(-1)).toBeGreaterThan(0.9);
    expect(shares.at(-1)).toBeLessThanOrEqual(1);
  });
});

describe('calculationKey', () => {
  it('stays the same for renaming, but changes with any number', () => {
    const plan = defaultPlan();
    const key = calculationKey(plan, false);

    const renamed: Plan = {
      ...plan,
      name: 'Sommerlager',
      debit: plan.debit.map((position, i) => i === 1 ? {...position, title: 'Turnhalle'} : position),
      cities: plan.cities.map((city, i) => i === 0 ? {...city, name: 'Stadt A'} : city),
    };
    expect(calculationKey(renamed, false)).toBe(key);

    expect(calculationKey(plan, true)).not.toBe(key);
    const changed: Plan = {
      ...plan, debit: plan.debit.map((position, i) => i === 1 ? {...position, amount: 700} : position),
    };
    expect(calculationKey(changed, false)).not.toBe(key);
  });

  it('changes when a position is replaced by one with the same numbers', () => {
    const plan = defaultPlan();
    const bus = plan.debit[4];
    const replaced: Plan = {...plan, debit: plan.debit.map(position =>
      position === bus ? newPosition(bus.title, bus.amount, bus.modifiers) : position)};

    expect(calculationKey(replaced, false)).not.toBe(calculationKey(plan, false));
  });
});
