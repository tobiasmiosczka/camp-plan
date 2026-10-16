import {City, newCity} from './city';
import {Context} from './context';
import {PER_NIGHT, perCity, perParticipantGroup, perPersonGroup} from './modifiers';
import {newPosition, Position, positionSum} from './position';
import {defaultPlan, emptyPlan, Plan, planFromJson, planToJson, rangeOf, withOthersLast} from './plan';
import {enumerateScenarios} from './scenarios';

describe('plan serialization', () => {
  const withDebit = (plan: Plan, position: Position): Plan => ({...plan, debit: [...plan.debit, position]});

  it('restores an identical plan after a round trip', () => {
    const plan = defaultPlan();
    const restored = planFromJson(planToJson(plan));

    expect(planToJson(restored)).toEqual(planToJson(plan));

    const context: Context = {participants: 23, leaders: 4, days: 3};
    expect(restored.credit.map(p => positionSum(p, context))).toEqual(plan.credit.map(p => positionSum(p, context)));
    expect(restored.debit.map(p => positionSum(p, context))).toEqual(plan.debit.map(p => positionSum(p, context)));
  });

  it('keeps cities and modifiers that point to them', () => {
    const plan = defaultPlan();
    const bottrop: City = newCity('Bottrop', {start: 0, end: 5});
    const restored = planFromJson(planToJson({
      ...plan,
      cities: withOthersLast([...plan.cities, bottrop]),
      credit: [...plan.credit, newPosition('Zuschuss Bottrop', 3, [perCity(bottrop)])],
    }));

    const cities = restored.cities;
    expect(cities.map(city => city.name)).toEqual(['Dinslaken', 'Voerde', 'Hünxe/Wesel', 'Bottrop', 'Sonstige']);
    expect(cities[3].participants).toEqual({start: 0, end: 5});
    expect(restored.credit.at(-1)!.modifiers).toEqual([{kind: 'city', city: cities[3].id}]);
  });

  it('gives every city and position a new id when loading', () => {
    const plan = defaultPlan();
    const restored = planFromJson(planToJson(plan));
    const ids = [...restored.cities, ...restored.debit, ...restored.credit].map(item => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(restored.cities[0].id).not.toBe(plan.cities[0].id);
  });

  it('reads version 1 files as a single city', () => {
    const restored = planFromJson(JSON.stringify({
      version: 1,
      days: {start: 1, end: 2}, participants: {start: 10, end: 20}, leaders: {start: 0, end: 1},
      debit: [], credit: [],
    }));

    expect(restored.cities.map(city => [city.name, city.others])).toEqual([['Sonstige', true]]);
    expect(rangeOf(restored, 'participants')).toEqual({start: 10, end: 20});
  });

  it('restores an empty plan with only „Sonstige“', () => {
    const restored = planFromJson(planToJson(emptyPlan()));

    expect(restored.cities.map(city => city.name)).toEqual(['Sonstige']);
    expect(restored.debit).toEqual([]);
    expect(enumerateScenarios(restored).participants.length).toBe(0);
  });

  it('always keeps exactly one „Sonstige“ as the last city', () => {
    const plan = planFromJson(JSON.stringify({
      version: 2, days: {start: 1, end: 1}, leaders: {start: 0, end: 0},
      cities: [{name: 'Sonstige', participants: {start: 1, end: 2}}, {name: 'Voerde', participants: {start: 0, end: 1}}],
      debit: [], credit: [],
    }));

    expect(plan.cities.map(city => [city.name, city.others])).toEqual([['Voerde', false], ['Sonstige', true]]);
    expect(plan.cities[1].participants).toEqual({start: 1, end: 2});
  });

  it('keeps the project name and accepts files without one', () => {
    expect(planFromJson(planToJson({...defaultPlan(), name: 'Sommerlager 2027'})).name).toBe('Sommerlager 2027');
    expect(planFromJson(JSON.stringify({
      version: 2, days: {start: 1, end: 1}, leaders: {start: 0, end: 0}, cities: [], debit: [], credit: [],
    })).name).toBe('');
  });

  it('keeps the per-night modifier', () => {
    const restored = planFromJson(planToJson(withDebit(defaultPlan(), newPosition('Übernachtung', 10, [PER_NIGHT]))));

    expect(restored.debit.at(-1)!.modifiers).toEqual([PER_NIGHT]);
  });

  it('keeps both kinds of group modifiers with their size', () => {
    const groups = newPosition('Gruppen', 10, [perPersonGroup(6), perParticipantGroup(4)]);
    const restored = planFromJson(planToJson(withDebit(defaultPlan(), groups)));

    expect(restored.debit.at(-1)!.modifiers).toEqual([perPersonGroup(6), perParticipantGroup(4)]);
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
