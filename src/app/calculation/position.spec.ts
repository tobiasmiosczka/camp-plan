import {City} from './city';
import {Context, FixedContext} from './context';
import {
  PER_DAY, PER_NIGHT, PER_PERSON, PerCityModifier, PerParticipantGroupModifier, PerPersonGroupModifier
} from './modifiers';
import {Position} from './position';

describe('PER_NIGHT', () => {
  const withDays = (days: number): Context => new FixedContext(0, 0, days);

  it('counts one night less than days', () => {
    const position = new Position('Übernachtung', 10, [PER_NIGHT]);

    expect(position.getSum(withDays(3))).toBe(20);
    expect(position.getSum(withDays(1))).toBe(0);
  });
});

describe('Position modifiers', () => {
  it('are ordered by kind, then by group size or city name', () => {
    const groupOf10 = new PerParticipantGroupModifier(10);
    const groupOf8 = new PerParticipantGroupModifier(8);
    const personGroup = new PerPersonGroupModifier(5);
    const cityB = new PerCityModifier(new City('B', {start: 0, end: 1}));
    const cityA = new PerCityModifier(new City('A', {start: 0, end: 1}));
    const position = new Position('x', 1, [cityB, groupOf10, PER_DAY, cityA, groupOf8, personGroup]);
    position.addModifier(PER_PERSON);

    expect(position.getModifiers()).toEqual([PER_PERSON, PER_DAY, personGroup, groupOf8, groupOf10, cityA, cityB]);
  });
});
