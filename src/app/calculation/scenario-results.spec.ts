import {contextsOf} from '../testing/contexts';
import {planWith} from '../testing/plans';
import {City, newCity} from './city';
import {Context} from './context';
import {Dimension} from './dimension';
import {enumerateScenarios} from './enumerate';
import {histogram} from './histogram';
import {ScenarioResults} from './scenario-results';

describe('ScenarioResults', () => {
  const a = newCity('A', {start: 0, end: 2});
  const b = newCity('B', {start: 1, end: 3});
  const c = newCity('C', {start: 0, end: 2});
  const plan = planWith({leaders: {start: 1, end: 2}, days: {start: 1, end: 1}, cities: [a, b, c]});
  // Hängt nur von der Gesamtzahl, A und den Leitern ab – wie Positionen, die nur auf A verweisen
  const value = (context: Context): number =>
    context.participants * 100 + (context.cities?.get(a.id) ?? 0) * 10 + context.leaders;
  const results = (relevant: City[]): ScenarioResults => {
    const scenarios = enumerateScenarios(plan, relevant.map(city => city.id));
    return new ScenarioResults(scenarios, Float64Array.from(contextsOf(scenarios), value), plan);
  };
  const full = results([a, b, c]);
  const merged = results([a]);

  const cases: [string, Dimension[]][] = [
    ['B', [{kind: 'city', city: b.id}]],
    ['B × C', [{kind: 'city', city: b.id}, {kind: 'city', city: c.id}]],
    ['Teilnehmer × B', [{kind: 'type', type: 'participants'}, {kind: 'city', city: b.id}]],
    ['A × Leiter', [{kind: 'city', city: a.id}, {kind: 'type', type: 'leaders'}]],
    ['Sonstige (automatisch ergänzt)', [{kind: 'city', city: plan.cities[3]!.id}]],
  ];
  for (const [name, dimensions] of cases) {
    it(`groups merged cities exactly like a full enumeration: ${name}`, () => {
      expect(merged.aggregate(dimensions)).toEqual(full.aggregate(dimensions));
    });
  }

  it('counts every real scenario, also those merged into one', () => {
    expect(full.weights.every(weight => weight === 1)).toBe(true);
    expect(merged.scenarioCount).toBe(full.scenarioCount);
    expect(merged.size).toBeLessThan(full.size);
  });

  it('builds the same histogram from merged scenarios as from all of them', () => {
    expect(histogram(merged.values, merged.weights, 10)).toEqual(histogram(full.values, full.weights, 10));
  });

  it('averages and counts deficits over all real scenarios, also those merged into one', () => {
    expect(merged.mean()).toBeCloseTo(full.mean(), 9);
    expect(merged.mean(merged.scenarios.leaders)).toBeCloseTo(1.5, 9);

    const centered = (results: ScenarioResults): ScenarioResults =>
      new ScenarioResults(results.scenarios, results.values.map(value => value - 400), plan);
    const deficits = full.values.filter(value => value < 400).length;
    expect(centered(full).deficitShare()).toBeCloseTo(deficits / full.scenarioCount, 9);
    expect(centered(merged).deficitShare()).toBeCloseTo(centered(full).deficitShare(), 9);
  });

  it('lists the values a dimension can take', () => {
    expect(merged.domain({kind: 'city', city: b.id})).toEqual([1, 2, 3]);
    expect(merged.domain({kind: 'type', type: 'participants'})).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
