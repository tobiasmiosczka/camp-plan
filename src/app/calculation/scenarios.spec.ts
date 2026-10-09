import {City, Context, ContextRange, ContextType, Range} from './position';
import {Dimension, ScenarioCache, ScenarioResults} from './scenarios';

describe('ScenarioResults', () => {
  const a = new City('A', {start: 0, end: 2, step: 1});
  const b = new City('B', {start: 1, end: 3, step: 1});
  const c = new City('C', {start: 0, end: 2, step: 1});
  const contextRange = new ContextRange(new Map<ContextType, Range>([
    [ContextType.LEADERS, {start: 1, end: 2, step: 1}],
    [ContextType.DAYS, {start: 1, end: 1, step: 1}],
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

  it('lists the values a dimension can take', () => {
    expect(merged.domain({kind: 'city', city: b})).toEqual([1, 2, 3]);
    expect(merged.domain({kind: 'type', type: ContextType.PARTICIPANTS})).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('ScenarioCache', () => {
  it('reuses scenarios until ranges or cities change', () => {
    const city = new City('A', {start: 1, end: 2, step: 1});
    const contextRange = new ContextRange(new Map<ContextType, Range>([
      [ContextType.LEADERS, {start: 1, end: 1, step: 1}],
      [ContextType.DAYS, {start: 1, end: 1, step: 1}],
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
