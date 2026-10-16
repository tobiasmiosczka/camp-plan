import {contextsOf} from '../testing/contexts';
import {planWith} from '../testing/plans';
import {City, newCity, othersCity} from './city';
import {Context} from './context';
import {enumerateScenarios} from './enumerate';
import {rangeOf} from './plan';

describe('enumerateScenarios', () => {
  const a = newCity('A', {start: 0, end: 2});
  const b = newCity('B', {start: 1, end: 2});
  const plan = planWith({leaders: {start: 1, end: 1}, days: {start: 1, end: 1}, cities: [a, b]});
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
    const plan = planWith({
      leaders: {start: 0, end: 1}, days: {start: 2, end: 3}, cities: [othersCity({start: 1, end: 2})],
    });
    const scenarios = enumerateScenarios(plan, []);

    expect([...scenarios.participants]).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect([...scenarios.leaders]).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect([...scenarios.days]).toEqual([2, 3, 2, 3, 2, 3, 2, 3]);
  });

  it('merges cities that are not relevant into their total', () => {
    expect(contexts([b]).map(c => [from(c, b), c.participants]))
      .toEqual([[1, 1], [1, 2], [1, 3], [2, 2], [2, 3], [2, 4]]);
  });

  it('skips scenarios without participants', () => {
    const empty = planWith({leaders: {start: 0, end: 0}, days: {start: 1, end: 1}, cities: [newCity('A', {start: 0, end: 0})]});

    expect(enumerateScenarios(empty).participants.length).toBe(0);
  });
});
