import { planFromJson } from '../calculation/plan';
import { City, PER_NIGHT, PerCityModifier, PerParticipantGroup } from '../calculation/position';
import { DE } from './de';
import { EN } from './en';
import { cityName, describeModifier, fileErrorMessage } from './labels';

describe('labels', () => {
  it('describes modifiers in the chosen language', () => {
    const others = City.others();
    expect(describeModifier(PER_NIGHT, EN)).toBe('per night');
    expect(describeModifier(new PerParticipantGroup(8), EN)).toBe('per 8 participants');
    expect(describeModifier(new PerCityModifier(others), EN)).toBe('per participant from Other');
    expect(describeModifier(new PerParticipantGroup(8), DE)).toBe('pro 8 Teilnehmer');
  });

  it('translates only the name of the catch-all city', () => {
    expect(cityName(City.others(), EN)).toBe('Other');
    expect(cityName(new City('Dinslaken', {start: 0, end: 1}), EN)).toBe('Dinslaken');
  });

  it('translates errors in plan files', () => {
    const error = (json: string): unknown => {
      try {
        planFromJson(json);
      } catch (e) {
        return e;
      }
      throw new Error('expected an error');
    };
    const base = {version: 2, days: {start: 1, end: 2}, leaders: {start: 0, end: 1}, cities: [], debit: []};

    expect(fileErrorMessage(error('no json'), EN)).toBe('The file is not valid JSON.');
    expect(fileErrorMessage(error(JSON.stringify({...base, days: {start: 3, end: 2}})), EN))
      .toBe('Invalid range for Days.');
    expect(fileErrorMessage(error(JSON.stringify(base)), EN)).toBe('No income in the file.');
    expect(fileErrorMessage(error(JSON.stringify(base)), DE)).toBe('Einnahmen fehlen in der Datei.');
    expect(fileErrorMessage(new Error('Disk full'), EN)).toBe('Disk full');
  });
});
