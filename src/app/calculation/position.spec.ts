import {City, Context, ContextRange, ContextType, PER_NIGHT, PER_PARTICIPANT, PerCityModifier, Position, Range} from './position';

describe('PER_NIGHT', () => {
  const withDays = (days: number): Context => new Context(0, 0, days);

  it('counts one night less than days', () => {
    const position = new Position('Übernachtung', 10, [PER_NIGHT]);

    expect(position.getSum(withDays(3))).toBe(20);
    expect(position.getSum(withDays(1))).toBe(0);
  });
});

describe('ContextRange with cities', () => {
  const a = new City('A', {start: 0, end: 2, step: 1});
  const b = new City('B', {start: 1, end: 2, step: 1});
  const contextRange = new ContextRange(new Map<ContextType, Range>([
    [ContextType.LEADERS, {start: 1, end: 1, step: 1}],
    [ContextType.DAYS, {start: 1, end: 1, step: 1}],
  ]), [a, b]);

  it('combines every participant count of every city', () => {
    const permutations = contextRange.getPermutations();

    expect(permutations.length).toBe(6);
    expect(permutations.map(c => [c.getParticipantsFrom(a), c.getParticipantsFrom(b)]))
      .toEqual([[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(permutations.map(c => c.get(ContextType.PARTICIPANTS))).toEqual([1, 2, 2, 3, 3, 4]);
    expect(contextRange.get(ContextType.PARTICIPANTS)).toEqual({start: 1, end: 4, step: 1});
  });

  it('counts only participants of the chosen city', () => {
    const context = contextRange.getPermutations()[5];

    expect(new Position('A', 10, [new PerCityModifier(a)]).getSum(context)).toBe(20);
    expect(new Position('Alle', 10, [PER_PARTICIPANT]).getSum(context)).toBe(40);
  });

  it('merges cities that are not relevant into their total', () => {
    const permutations = contextRange.getPermutations([b]);

    expect(permutations.map(c => [c.getParticipantsFrom(b), c.get(ContextType.PARTICIPANTS)]))
      .toEqual([[1, 1], [1, 2], [1, 3], [2, 2], [2, 3], [2, 4]]);
  });

  it('skips scenarios without participants', () => {
    const empty = new ContextRange(new Map<ContextType, Range>(), [new City('A', {start: 0, end: 0, step: 1})]);

    expect(empty.getPermutations()).toEqual([]);
  });
});
