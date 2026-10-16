import {City} from './city';
import {ContextType, FixedContext} from './context';
import {PER_NIGHT, PerCityModifier, PerParticipantGroupModifier, PerPersonGroupModifier} from './modifiers';
import {Position} from './position';
import {defaultPlan, emptyPlan, planFromJson, planToJson} from './plan';
import {enumerateScenarios} from './scenarios';

describe('plan serialization', () => {
  it('restores an identical plan after a round trip', () => {
    const plan = defaultPlan();
    const restored = planFromJson(planToJson(plan));

    expect(planToJson(restored)).toEqual(planToJson(plan));

    const context = new FixedContext(23, 4, 3);
    expect(restored.credit.map(p => p.getSum(context))).toEqual(plan.credit.map(p => p.getSum(context)));
    expect(restored.debit.map(p => p.getSum(context))).toEqual(plan.debit.map(p => p.getSum(context)));
  });

  it('keeps cities and modifiers that point to them', () => {
    const plan = defaultPlan();
    const bottrop = new City('Bottrop', {start: 0, end: 5});
    plan.contextRange.addCity(bottrop);
    plan.credit.push(new Position('Zuschuss Bottrop', 3, [new PerCityModifier(bottrop)]));
    const restored = planFromJson(planToJson(plan));

    const cities = restored.contextRange.getCities();
    expect(cities.map(city => city.getName())).toEqual(['Dinslaken', 'Voerde', 'Hünxe/Wesel', 'Bottrop', 'Sonstige']);
    expect(cities[3].getParticipants()).toEqual({start: 0, end: 5});
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
    expect(restored.contextRange.get(ContextType.PARTICIPANTS)).toEqual({start: 10, end: 20});
  });

  it('restores an empty plan with only „Sonstige“', () => {
    const restored = planFromJson(planToJson(emptyPlan()));

    expect(restored.contextRange.getCities().map(city => city.getName())).toEqual(['Sonstige']);
    expect(restored.debit).toEqual([]);
    expect(enumerateScenarios(restored.contextRange).participants.length).toBe(0);
  });

  it('always keeps exactly one „Sonstige“ as the last city', () => {
    const plan = planFromJson(JSON.stringify({
      version: 2, days: {start: 1, end: 1}, leaders: {start: 0, end: 0},
      cities: [{name: 'Sonstige', participants: {start: 1, end: 2}}, {name: 'Voerde', participants: {start: 0, end: 1}}],
      debit: [], credit: [],
    }));
    const cities = plan.contextRange.getCities();

    expect(cities.map(city => [city.getName(), city.isOthers()])).toEqual([['Voerde', false], ['Sonstige', true]]);
    expect(cities[1].getParticipants()).toEqual({start: 1, end: 2});
    expect(plan.contextRange.removeCity(cities[1])).toBe(1);
    expect(cities.length).toBe(2);
  });

  it('keeps the project name and accepts files without one', () => {
    const plan = defaultPlan();
    plan.name = 'Sommerlager 2027';

    expect(planFromJson(planToJson(plan)).name).toBe('Sommerlager 2027');
    expect(planFromJson(JSON.stringify({
      version: 2, days: {start: 1, end: 1}, leaders: {start: 0, end: 0}, cities: [], debit: [], credit: [],
    })).name).toBe('');
  });

  it('keeps the per-night modifier', () => {
    const plan = defaultPlan();
    plan.debit.push(new Position('Übernachtung', 10, [PER_NIGHT]));
    const restored = planFromJson(planToJson(plan));

    expect(restored.debit[restored.debit.length - 1].getModifiers()).toEqual([PER_NIGHT]);
  });

  it('keeps both kinds of group modifiers with their size', () => {
    const plan = defaultPlan();
    plan.debit.push(new Position('Gruppen', 10, [new PerPersonGroupModifier(6), new PerParticipantGroupModifier(4)]));
    const restored = planFromJson(planToJson(plan));
    const [persons, participants] = restored.debit[restored.debit.length - 1].getModifiers();

    expect(persons).toBeInstanceOf(PerPersonGroupModifier);
    expect((persons as PerPersonGroupModifier).getGroupSize()).toBe(6);
    expect(participants).toBeInstanceOf(PerParticipantGroupModifier);
    expect((participants as PerParticipantGroupModifier).getGroupSize()).toBe(4);
  });

  it('rejects files that are not a plan', () => {
    expect(() => planFromJson('kein json')).toThrow('kein gültiges JSON');
    expect(() => planFromJson('{"version": 3}')).toThrow('unbekannte Version');
    expect(() => planFromJson(JSON.stringify({
      version: 1,
      days: {start: 1, end: 2}, participants: {start: 1, end: 2}, leaders: {start: 0, end: 1},
      debit: [{title: 'x', amount: 1, modifiers: [{type: 'unbekannt'}]}], credit: [],
    }))).toThrow('Unbekannter Faktor');
    expect(() => planFromJson(JSON.stringify({
      version: 2, days: {start: 1, end: 1}, leaders: {start: 0, end: 0}, cities: [], credit: [],
      debit: [{title: 'x', amount: 1, modifiers: [{type: 'toString'}]}],
    }))).toThrow('Unbekannter Faktor');
    expect(() => planFromJson(JSON.stringify({
      version: 2, days: {start: 1, end: 1}, leaders: {start: 0, end: 0}, cities: [], credit: [],
      debit: [{title: 'x', amount: 1, modifiers: [{type: 'personGroup'}]}],
    }))).toThrow('Ungültige Gruppengröße');
  });
});
