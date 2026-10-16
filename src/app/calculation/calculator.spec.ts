import {contextsOf} from '../testing/contexts';
import {calculate} from './calculator';
import {newCity} from './city';
import {Context} from './context';
import {PER_DAY, PER_LEADER, PER_NIGHT, PER_PARTICIPANT, PER_PERSON, perCity, perParticipantGroup} from './modifiers';
import {emptyPlan, Plan, withOthersLast} from './plan';
import {newPosition, Position, positionSum} from './position';
import {enumerateScenarios} from './scenarios';

describe('calculate', () => {
  const a = newCity('A', {start: 0, end: 3});
  const b = newCity('B', {start: 1, end: 2});
  const plan: Plan = {
    ...emptyPlan(),
    leaders: {start: 0, end: 2},
    days: {start: 1, end: 3},
    cities: withOthersLast([a, b]),
    debit: [
      newPosition('Essen', 7, [PER_PERSON, PER_DAY]),
      newPosition('Halle', 300),
      newPosition('Tickets', 40, [perParticipantGroup(2)]),
    ],
    credit: [
      newPosition('Beitrag', 60, [PER_PARTICIPANT]),
      newPosition('Leiter', 5, [PER_LEADER]),
      newPosition('Förderung A', 4, [perCity(a), PER_NIGHT]),
      newPosition('Förderung A pro Leiter', 2, [PER_LEADER, perCity(a)]),
    ],
  };
  const scenarios = enumerateScenarios(plan, [a.id]);
  const contexts: Context[] = contextsOf(scenarios);

  for (const perParticipant of [false, true]) {
    it(`matches summing every position in every scenario (pro Teilnehmer: ${perParticipant})`, () => {
      const result = calculate(scenarios, plan, perParticipant);
      const share = (context: Context): number => perParticipant ? context.participants : 1;
      const sum = (positions: readonly Position[], i: number): number => positions.reduce((total, position) =>
        total + positionSum(position, contexts[i]) / share(contexts[i]), 0);

      contexts.forEach((_, i) => {
        expect(result.values[i]).toBeCloseTo(sum(plan.credit, i) - sum(plan.debit, i), 9);
        expect(result.debitValues[i]).toBeCloseTo(sum(plan.debit, i), 9);
        expect(result.creditValues[i]).toBeCloseTo(sum(plan.credit, i), 9);
      });
      [...plan.debit, ...plan.credit].forEach((position, i) => {
        const sums = contexts.map(context => positionSum(position, context) / share(context));
        expect(result.positionSums[i].min).toBeCloseTo(Math.min(...sums), 9);
        expect(result.positionSums[i].max).toBeCloseTo(Math.max(...sums), 9);
      });
      const debits = contexts.map((_, i) => sum(plan.debit, i));
      expect(result.debitTotal.min).toBeCloseTo(Math.min(...debits), 9);
      expect(result.debitTotal.max).toBeCloseTo(Math.max(...debits), 9);
    });
  }

  it('returns empty ranges without scenarios', () => {
    const empty: Plan = {...plan, cities: withOthersLast([])};
    const result = calculate(enumerateScenarios(empty, []), empty, false);

    expect(result.values.length).toBe(0);
    expect(result.balance).toEqual({min: 0, max: 0});
    expect(result.positionSums.every(sum => sum.min === 0 && sum.max === 0)).toBe(true);
  });
});
