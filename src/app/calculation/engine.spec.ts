import {calculate} from './calculator';
import {calculationKey, evaluate, transferables} from './engine';
import {defaultPlan, planToData} from './plan';
import {ContextType, Position} from './position';
import {ScenarioResults} from './scenarios';

describe('evaluate', () => {
  it('returns the same numbers as calculating the plan directly', () => {
    const plan = defaultPlan();
    const result = evaluate(planToData(plan), false);
    const relevant = plan.contextRange.getCities().slice(0, 3);
    const contexts = plan.contextRange.getPermutations(relevant);
    const expected = calculate(contexts, plan.contextRange, plan.debit, plan.credit, false);

    expect(result.values).toEqual(expected.values);
    expect(result.balance).toEqual(expected.balance);
    const positions: Position[] = [...plan.debit, ...plan.credit];
    expect(result.positionSums).toEqual(positions.map(position => expected.positionSums.get(position)));
  });

  it('lists scenarios as columns that resolve to the cities of the plan', () => {
    const plan = defaultPlan();
    const result = evaluate(planToData(plan), false);
    const cities = plan.contextRange.getCities();

    // Dinslaken, Voerde und Hünxe/Wesel haben eigene Förderungen, „Sonstige“ nicht
    expect(result.scenarios.relevant).toEqual([0, 1, 2]);
    const results = new ScenarioResults(result.scenarios, result.values, plan.contextRange);
    expect(results.domain({kind: 'city', city: cities[1]})).toEqual([0, 1, 2]);
    expect(results.aggregate([{kind: 'type', type: ContextType.DAYS}]).size).toBe(2);
  });

  it('hands over every column without copying', () => {
    const result = evaluate(planToData(defaultPlan()), false);

    expect(transferables(result).length).toBe(6 + result.scenarios.cities.length);
    expect(new Set(transferables(result)).size).toBe(transferables(result).length);
  });
});

describe('calculationKey', () => {
  it('stays the same for renaming, but changes with any number', () => {
    const plan = defaultPlan();
    const key = calculationKey(planToData(plan), false);

    plan.name = 'Sommerlager';
    plan.debit[1].setTitle('Turnhalle');
    plan.contextRange.getCities()[0].setName('Stadt A');
    expect(calculationKey(planToData(plan), false)).toBe(key);

    expect(calculationKey(planToData(plan), true)).not.toBe(key);
    plan.debit[1].setAmount(700);
    expect(calculationKey(planToData(plan), false)).not.toBe(key);
  });
});
