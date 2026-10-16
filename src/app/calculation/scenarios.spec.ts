import {contextsOf} from '../testing/contexts';
import {City, newCity, othersCity} from './city';
import {Context} from './context';
import {emptyPlan, Plan, rangeOf, withOthersLast} from './plan';
import {Range} from './range';
import {Dimension, enumerateScenarios, histogram, ScenarioResults} from './scenarios';

/** Ein Plan nur mit Rahmenbedingungen; „Sonstige“ wird ergänzt. */
function frame(leaders: Range, days: Range, cities: City[]): Plan {
  return {...emptyPlan(), leaders, days, cities: withOthersLast(cities)};
}

describe('enumerateScenarios', () => {
  const a = newCity('A', {start: 0, end: 2});
  const b = newCity('B', {start: 1, end: 2});
  const plan = frame({start: 1, end: 1}, {start: 1, end: 1}, [a, b]);
  const contexts = (relevant?: City[]) => contextsOf(enumerateScenarios(plan, relevant?.map(city => city.id)));
  const from = (context: Context, city: City): number => context.cities?.get(city.id) ?? 0;

  it('combines every participant count of every city', () => {
    const all = contexts();

    expect(all.length).toBe(6);
    expect(all.map(c => [from(c, a), from(c, b)])).toEqual([[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(all.map(c => c.participants)).toEqual([1, 2, 2, 3, 3, 4]);
    expect(rangeOf(plan, 'participants')).toEqual({start: 1, end: 4});
  });

  it('varies days fastest, then leaders, then participants', () => {
    const scenarios = enumerateScenarios({
      ...frame({start: 0, end: 1}, {start: 2, end: 3}, []),
      cities: [othersCity({start: 1, end: 2})],
    }, []);

    expect([...scenarios.participants]).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect([...scenarios.leaders]).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect([...scenarios.days]).toEqual([2, 3, 2, 3, 2, 3, 2, 3]);
  });

  it('merges cities that are not relevant into their total', () => {
    expect(contexts([b]).map(c => [from(c, b), c.participants]))
      .toEqual([[1, 1], [1, 2], [1, 3], [2, 2], [2, 3], [2, 4]]);
  });

  it('skips scenarios without participants', () => {
    const empty = frame({start: 0, end: 0}, {start: 1, end: 1}, [newCity('A', {start: 0, end: 0})]);

    expect(enumerateScenarios(empty).participants.length).toBe(0);
  });
});

describe('ScenarioResults', () => {
  const a = newCity('A', {start: 0, end: 2});
  const b = newCity('B', {start: 1, end: 3});
  const c = newCity('C', {start: 0, end: 2});
  const plan = frame({start: 1, end: 2}, {start: 1, end: 1}, [a, b, c]);
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
    ['Sonstige (automatisch ergänzt)', [{kind: 'city', city: plan.cities[3].id}]],
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

describe('histogram', () => {
  it('uses round class widths with a border at zero', () => {
    const result = histogram([-120, -5, 0, 40, 380], [1, 1, 1, 2, 1], 10);

    expect(result.width).toBe(50);
    expect(result.start).toBe(-150);
    expect(result.counts.length).toBe(11);
    expect(result.counts[0]).toBe(1); // −120 in [−150, −100)
    expect(result.counts[2]).toBe(1); // −5 in [−50, 0)
    expect(result.counts[3]).toBe(3); // 0 und zweimal 40 in [0, 50)
    expect(result.counts[10]).toBe(1); // 380 in [350, 400)
    expect(result.counts.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('handles a single value', () => {
    expect(histogram([7, 7], [1, 1]).counts).toEqual([2]);
  });
});
