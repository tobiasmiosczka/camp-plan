import {City, Context, ContextRange, ContextType, Range} from './position';
import {Dimension, histogram, ScenarioCache, ScenarioResults} from './scenarios';

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
    const contexts = contextRange.getPermutations(relevant);
    return new ScenarioResults(contexts, contexts.map(value), contextRange, relevant);
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
    expect(merged.contexts.length).toBeLessThan(full.contexts.length);
  });

  it('builds the same histogram from merged scenarios as from all of them', () => {
    expect(histogram(merged.values, merged.weights, 10)).toEqual(histogram(full.values, full.weights, 10));
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

describe('ScenarioCache', () => {
  it('reuses scenarios until ranges or cities change', () => {
    const city = new City('A', {start: 1, end: 2});
    const contextRange = new ContextRange(new Map<ContextType, Range>([
      [ContextType.LEADERS, {start: 1, end: 1}],
      [ContextType.DAYS, {start: 1, end: 1}],
    ]), [city]);
    const cache = new ScenarioCache();

    const first = cache.getContexts(contextRange, []);
    expect(cache.getContexts(contextRange, [])).toBe(first);

    city.getParticipants().end = 3;
    const second = cache.getContexts(contextRange, []);
    expect(second).not.toBe(first);
    expect(second.length).toBe(3);
    expect(cache.getContexts(contextRange, [city])).not.toBe(second);
  });
});
