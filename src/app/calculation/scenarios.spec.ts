import {contextsOf} from '../testing/contexts';
import {City} from './city';
import {Context, ContextRange, ContextType} from './context';
import {PER_PARTICIPANT, PerCityModifier} from './modifiers';
import {Position} from './position';
import {Range} from './range';
import {ColumnContext, Dimension, enumerateScenarios, histogram, ScenarioResults} from './scenarios';

describe('enumerateScenarios', () => {
  const a = new City('A', {start: 0, end: 2});
  const b = new City('B', {start: 1, end: 2});
  const contextRange = new ContextRange(new Map<ContextType, Range>([
    [ContextType.LEADERS, {start: 1, end: 1}],
    [ContextType.DAYS, {start: 1, end: 1}],
  ]), [a, b]);
  const cities = (relevant?: City[]) => contextsOf(enumerateScenarios(contextRange, relevant), contextRange.getCities());

  it('combines every participant count of every city', () => {
    const contexts = cities();

    expect(contexts.length).toBe(6);
    expect(contexts.map(c => [c.getParticipantsFrom(a), c.getParticipantsFrom(b)]))
      .toEqual([[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(contexts.map(c => c.get(ContextType.PARTICIPANTS))).toEqual([1, 2, 2, 3, 3, 4]);
    expect(contextRange.get(ContextType.PARTICIPANTS)).toEqual({start: 1, end: 4});
  });

  it('varies days fastest, then leaders, then participants', () => {
    const range = new ContextRange(new Map<ContextType, Range>([
      [ContextType.LEADERS, {start: 0, end: 1}],
      [ContextType.DAYS, {start: 2, end: 3}],
    ]), [City.others({start: 1, end: 2})]);
    const scenarios = enumerateScenarios(range, []);

    expect([...scenarios.participants]).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect([...scenarios.leaders]).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect([...scenarios.days]).toEqual([2, 3, 2, 3, 2, 3, 2, 3]);
  });

  it('counts only participants of the chosen city', () => {
    const context = new ColumnContext(enumerateScenarios(contextRange), contextRange.getCities());
    context.index = 5;

    expect(new Position('A', 10, [new PerCityModifier(a)]).getSum(context)).toBe(20);
    expect(new Position('Alle', 10, [PER_PARTICIPANT]).getSum(context)).toBe(40);
  });

  it('merges cities that are not relevant into their total', () => {
    expect(cities([b]).map(c => [c.getParticipantsFrom(b), c.get(ContextType.PARTICIPANTS)]))
      .toEqual([[1, 1], [1, 2], [1, 3], [2, 2], [2, 3], [2, 4]]);
  });

  it('skips scenarios without participants', () => {
    const empty = new ContextRange(new Map<ContextType, Range>(), [new City('A', {start: 0, end: 0})]);

    expect(enumerateScenarios(empty).participants.length).toBe(0);
  });
});

describe('ScenarioResults', () => {
  const a = new City('A', {start: 0, end: 2});
  const b = new City('B', {start: 1, end: 3});
  const c = new City('C', {start: 0, end: 2});
  const contextRange = new ContextRange(new Map<ContextType, Range>([
    [ContextType.LEADERS, {start: 1, end: 2}],
    [ContextType.DAYS, {start: 1, end: 1}],
  ]), [a, b, c]);
  // Hängt nur von der Gesamtzahl, A und den Leitern ab – wie Positionen, die nur auf A verweisen
  const value = (context: Context): number =>
    context.get(ContextType.PARTICIPANTS) * 100 + context.getParticipantsFrom(a) * 10 + context.get(ContextType.LEADERS);
  const results = (relevant: City[]): ScenarioResults => {
    const scenarios = enumerateScenarios(contextRange, relevant);
    return new ScenarioResults(scenarios, Float64Array.from(contextsOf(scenarios, contextRange.getCities()), value),
      contextRange);
  };
  const full = results([a, b, c]);
  const merged = results([a]);

  const cases: [string, Dimension[]][] = [
    ['B', [{kind: 'city', city: b}]],
    ['B × C', [{kind: 'city', city: b}, {kind: 'city', city: c}]],
    ['Teilnehmer × B', [{kind: 'type', type: ContextType.PARTICIPANTS}, {kind: 'city', city: b}]],
    ['A × Leiter', [{kind: 'city', city: a}, {kind: 'type', type: ContextType.LEADERS}]],
    ['Sonstige (automatisch ergänzt)', [{kind: 'city', city: contextRange.getCities()[3]}]],
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
      new ScenarioResults(results.scenarios, results.values.map(value => value - 400), contextRange);
    const deficits = full.values.filter(value => value < 400).length;
    expect(centered(full).deficitShare()).toBeCloseTo(deficits / full.scenarioCount, 9);
    expect(centered(merged).deficitShare()).toBeCloseTo(centered(full).deficitShare(), 9);
  });

  it('lists the values a dimension can take', () => {
    expect(merged.domain({kind: 'city', city: b})).toEqual([1, 2, 3]);
    expect(merged.domain({kind: 'type', type: ContextType.PARTICIPANTS})).toEqual([1, 2, 3, 4, 5, 6, 7]);
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
