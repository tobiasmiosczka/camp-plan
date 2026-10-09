import {Context, ContextType} from './position';
import {defaultPlan, planFromJson, planToJson} from './plan';

describe('plan serialization', () => {
  it('restores an identical plan after a round trip', () => {
    const plan = defaultPlan();
    const restored = planFromJson(planToJson(plan));

    expect(planToJson(restored)).toEqual(planToJson(plan));

    const context = new Context(new Map<ContextType, number>([
      [ContextType.PARTICIPANTS, 23],
      [ContextType.LEADERS, 4],
      [ContextType.DAYS, 3],
    ]));
    expect(restored.credit.map(p => p.getSum(context))).toEqual(plan.credit.map(p => p.getSum(context)));
    expect(restored.debit.map(p => p.getSum(context))).toEqual(plan.debit.map(p => p.getSum(context)));
  });

  it('rejects files that are not a plan', () => {
    expect(() => planFromJson('kein json')).toThrow('kein gültiges JSON');
    expect(() => planFromJson('{"version": 2}')).toThrow('unbekannte Version');
    expect(() => planFromJson(JSON.stringify({
      version: 1,
      days: {start: 1, end: 2}, participants: {start: 1, end: 2}, leaders: {start: 0, end: 1},
      debit: [{title: 'x', amount: 1, modifiers: [{type: 'unbekannt'}]}], credit: [],
    }))).toThrow('Unbekannter Faktor');
  });
});
