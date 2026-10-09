import {Calculator} from './calculator';
import {
  City, ContextRange, ContextType, PER_DAY, PER_LEADER, PER_NIGHT, PER_PARTICIPANT, PER_PERSON, PerCityModifier,
  PerParticipantGroup, Position, Range
} from './position';

describe('Calculator', () => {
  const a = new City('A', {start: 0, end: 3, step: 1});
  const b = new City('B', {start: 1, end: 2, step: 1});
  const contextRange = new ContextRange(new Map<ContextType, Range>([
    [ContextType.LEADERS, {start: 0, end: 2, step: 1}],
    [ContextType.DAYS, {start: 1, end: 3, step: 1}],
  ]), [a, b]);
  const debit = [
    new Position('Essen', 7, [PER_PERSON, PER_DAY]),
    new Position('Halle', 300),
    new Position('Tickets', 40, [new PerParticipantGroup(2)]),
  ];
  const credit = [
    new Position('Beitrag', 60, [PER_PARTICIPANT]),
    new Position('Leiter', 5, [PER_LEADER]),
    new Position('Förderung A', 4, [new PerCityModifier(a), PER_NIGHT]),
  ];
  const contexts = contextRange.getPermutations([a]);

  for (const perParticipant of [false, true]) {
    it(`matches summing every position in every scenario (pro Teilnehmer: ${perParticipant})`, () => {
      const result = new Calculator().calculate(contexts, contextRange, debit, credit, perParticipant);
      const sum = (positions: Position[], i: number): number => positions.reduce((total, position) =>
        total + position.getSum(contexts[i]) / (perParticipant ? contexts[i].get(ContextType.PARTICIPANTS) : 1), 0);

      contexts.forEach((_, i) => expect(result.values[i]).toBeCloseTo(sum(credit, i) - sum(debit, i), 9));
      for (const position of [...debit, ...credit]) {
        const sums = contexts.map(context =>
          position.getSum(context) / (perParticipant ? context.get(ContextType.PARTICIPANTS) : 1));
        expect(result.positionSums.get(position)!.min).toBeCloseTo(Math.min(...sums), 9);
        expect(result.positionSums.get(position)!.max).toBeCloseTo(Math.max(...sums), 9);
      }
      const debits = contexts.map((_, i) => sum(debit, i));
      expect(result.debitTotal.min).toBeCloseTo(Math.min(...debits), 9);
      expect(result.debitTotal.max).toBeCloseTo(Math.max(...debits), 9);
    });
  }

  it('reuses the result until a number changes, but not for renaming', () => {
    const calculator = new Calculator();
    const first = calculator.calculate(contexts, contextRange, debit, credit, false);

    debit[1].setTitle('Turnhalle');
    a.setName('Stadt A');
    expect(calculator.calculate(contexts, contextRange, debit, credit, false)).toBe(first);

    debit[1].setAmount(350);
    const second = calculator.calculate(contexts, contextRange, debit, credit, false);
    expect(second).not.toBe(first);
    expect(second.debitTotal.min).toBe(first.debitTotal.min + 50);
  });
});
