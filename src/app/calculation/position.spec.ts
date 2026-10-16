import {newCity} from './city';
import {Context} from './context';
import {PER_DAY, PER_NIGHT, PER_PERSON, perCity, perParticipantGroup, perPersonGroup} from './modifiers';
import {newPosition, positionSum} from './position';

describe('PER_NIGHT', () => {
  const withDays = (days: number): Context => ({participants: 0, leaders: 0, days});

  it('counts one night less than days', () => {
    const position = newPosition('Übernachtung', 10, [PER_NIGHT]);

    expect(positionSum(position, withDays(3))).toBe(20);
    expect(positionSum(position, withDays(1))).toBe(0);
  });
});

describe('Position modifiers', () => {
  it('are ordered by kind, then by group size; cities keep their order', () => {
    const cityB = perCity(newCity('B', {start: 0, end: 1}));
    const cityA = perCity(newCity('A', {start: 0, end: 1}));
    const position = newPosition('x', 1, [
      cityB, perParticipantGroup(10), PER_DAY, cityA, perParticipantGroup(8), perPersonGroup(5), PER_PERSON,
    ]);

    expect(position.modifiers).toEqual([
      PER_PERSON, PER_DAY, perPersonGroup(5), perParticipantGroup(8), perParticipantGroup(10), cityB, cityA,
    ]);
  });

  it('count participants of the chosen city only', () => {
    const a = newCity('A', {start: 0, end: 2});
    const context: Context = {participants: 4, leaders: 1, days: 1, cities: new Map([[a.id, 2]])};

    expect(positionSum(newPosition('A', 10, [perCity(a)]), context)).toBe(20);
    expect(positionSum(newPosition('B', 10, [perCity(newCity('B', {start: 0, end: 2}))]), context)).toBe(0);
  });
});
