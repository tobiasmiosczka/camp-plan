import {contextsOf} from '../testing/contexts';
import {calculate} from './calculator';
import {City} from './city';
import {ContextRange, ContextType} from './context';
import {
  PER_DAY, PER_LEADER, PER_NIGHT, PER_PARTICIPANT, PER_PERSON, PerCityModifier, PerParticipantGroupModifier
} from './modifiers';
import {Position} from './position';
import {Range} from './range';
import {enumerateScenarios} from './scenarios';

describe('calculate', () => {
  const a = new City('A', {start: 0, end: 3});
  const b = new City('B', {start: 1, end: 2});
  const contextRange = new ContextRange(new Map<ContextType, Range>([
    [ContextType.LEADERS, {start: 0, end: 2}],
    [ContextType.DAYS, {start: 1, end: 3}],
  ]), [a, b]);
  const debit = [
    new Position('Essen', 7, [PER_PERSON, PER_DAY]),
    new Position('Halle', 300),
    new Position('Tickets', 40, [new PerParticipantGroupModifier(2)]),
  ];
  const credit = [
    new Position('Beitrag', 60, [PER_PARTICIPANT]),
    new Position('Leiter', 5, [PER_LEADER]),
    new Position('Förderung A', 4, [new PerCityModifier(a), PER_NIGHT]),
  ];
  const scenarios = enumerateScenarios(contextRange, [a]);
  const contexts = contextsOf(scenarios, contextRange.getCities());

  for (const perParticipant of [false, true]) {
    it(`matches summing every position in every scenario (pro Teilnehmer: ${perParticipant})`, () => {
      const result = calculate(scenarios, contextRange, debit, credit, perParticipant);
      const sum = (positions: Position[], i: number): number => positions.reduce((total, position) =>
        total + position.getSum(contexts[i]) / (perParticipant ? contexts[i].get(ContextType.PARTICIPANTS) : 1), 0);

      contexts.forEach((_, i) => {
        expect(result.values[i]).toBeCloseTo(sum(credit, i) - sum(debit, i), 9);
        expect(result.debitValues[i]).toBeCloseTo(sum(debit, i), 9);
        expect(result.creditValues[i]).toBeCloseTo(sum(credit, i), 9);
      });
      [...debit, ...credit].forEach((position, i) => {
        const sums = contexts.map(context =>
          position.getSum(context) / (perParticipant ? context.get(ContextType.PARTICIPANTS) : 1));
        expect(result.positionSums[i].min).toBeCloseTo(Math.min(...sums), 9);
        expect(result.positionSums[i].max).toBeCloseTo(Math.max(...sums), 9);
      });
      const debits = contexts.map((_, i) => sum(debit, i));
      expect(result.debitTotal.min).toBeCloseTo(Math.min(...debits), 9);
      expect(result.debitTotal.max).toBeCloseTo(Math.max(...debits), 9);
    });
  }
});
