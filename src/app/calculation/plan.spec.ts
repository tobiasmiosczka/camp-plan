import {City, Context, ContextType, PER_NIGHT, PerCityModifier, Position} from './position';
import {defaultPlan, emptyPlan, planFromJson, planToJson} from './plan';

describe('plan serialization', () => {
  it('restores an identical plan after a round trip', () => {
    const plan = defaultPlan();
    const restored = planFromJson(planToJson(plan));

    expect(planToJson(restored)).toEqual(planToJson(plan));

    const context = new Context(23, 4, 3);
    expect(restored.credit.map(p => p.getSum(context))).toEqual(plan.credit.map(p => p.getSum(context)));
    expect(restored.debit.map(p => p.getSum(context))).toEqual(plan.debit.map(p => p.getSum(context)));
  });

  it('keeps cities and modifiers that point to them', () => {
    const plan = defaultPlan();
    const bottrop = new City('Bottrop', {start: 0, end: 5, step: 1});
    plan.contextRange.addCity(bottrop);
    plan.credit.push(new Position('Zuschuss Bottrop', 3, [new PerCityModifier(bottrop)]));
    const restored = planFromJson(planToJson(plan));

    const cities = restored.contextRange.getCities();
    expect(cities.map(city => city.getName())).toEqual(['Dinslaken', 'Voerde', 'Hünxe/Wesel', 'Bottrop', 'Sonstige']);
    expect(cities[3].getParticipants()).toEqual({start: 0, end: 5, step: 1});
    const modifier = restored.credit[restored.credit.length - 1].getModifiers()[0];
    expect(modifier instanceof PerCityModifier && modifier.getCity()).toBe(cities[3]);
  });

  it('reads version 1 files as a single city', () => {
    const restored = planFromJson(JSON.stringify({
      version: 1,
      days: {start: 1, end: 2}, participants: {start: 10, end: 20}, leaders: {start: 0, end: 1},
      debit: [], credit: [],
    }));

    expect(restored.contextRange.getCities().map(city => city.getName())).toEqual(['Sonstige']);
    expect(restored.contextRange.getCities()[0].isOthers()).toBe(true);
    expect(restored.contextRange.get(ContextType.PARTICIPANTS)).toEqual({start: 10, end: 20, step: 1});
  });

  it('restores an empty plan with only „Sonstige“', () => {
    const restored = planFromJson(planToJson(emptyPlan()));

    expect(restored.contextRange.getCities().map(city => city.getName())).toEqual(['Sonstige']);
    expect(restored.debit).toEqual([]);
    expect(restored.contextRange.getPermutations()).toEqual([]);
  });

  it('always keeps exactly one „Sonstige“ as the last city', () => {
    const plan = planFromJson(JSON.stringify({
      version: 2, days: {start: 1, end: 1}, leaders: {start: 0, end: 0},
      cities: [{name: 'Sonstige', participants: {start: 1, end: 2}}, {name: 'Voerde', participants: {start: 0, end: 1}}],
      debit: [], credit: [],
    }));
    const cities = plan.contextRange.getCities();

    expect(cities.map(city => [city.getName(), city.isOthers()])).toEqual([['Voerde', false], ['Sonstige', true]]);
    expect(cities[1].getParticipants()).toEqual({start: 1, end: 2, step: 1});
    expect(plan.contextRange.removeCity(cities[1])).toBe(1);
    expect(cities.length).toBe(2);
  });

  it('keeps the per-night modifier', () => {
    const plan = defaultPlan();
    plan.debit.push(new Position('Übernachtung', 10, [PER_NIGHT]));
    const restored = planFromJson(planToJson(plan));

    expect(restored.debit[restored.debit.length - 1].getModifiers()).toEqual([PER_NIGHT]);
  });

  it('rejects files that are not a plan', () => {
    expect(() => planFromJson('kein json')).toThrow('kein gültiges JSON');
    expect(() => planFromJson('{"version": 3}')).toThrow('unbekannte Version');
    expect(() => planFromJson(JSON.stringify({
      version: 1,
      days: {start: 1, end: 2}, participants: {start: 1, end: 2}, leaders: {start: 0, end: 1},
      debit: [{title: 'x', amount: 1, modifiers: [{type: 'unbekannt'}]}], credit: [],
    }))).toThrow('Unbekannter Faktor');
  });
});
