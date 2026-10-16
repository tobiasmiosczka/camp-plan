import {City, newCity, othersCity} from './city';
import {PER_DAY, PER_LEADER, PER_NIGHT, PER_PARTICIPANT, PER_PERSON, perCity, perParticipantGroup} from './modifiers';
import {Plan} from './plan';
import {newPosition} from './position';

/** Die Pläne, mit denen man beginnt: das Beispiel beim ersten Besuch und der leere nach „Alles zurücksetzen“. */

export function defaultPlan(): Plan {
  const dinslaken: City = newCity('Dinslaken', {start: 20, end: 60});
  const voerde: City = newCity('Voerde', {start: 0, end: 2});
  const huenxeWesel: City = newCity('Hünxe/Wesel', {start: 0, end: 2});
  return {
    ...emptyPlan(),
    name: 'Beispiel-Zeltlager',
    cities: [dinslaken, voerde, huenxeWesel, othersCity({start: 0, end: 2})],
    debit: [
      newPosition('Verpflegung', 7, [PER_PERSON, PER_DAY]),
      newPosition('Endreinigung Halle', 654.5),
      newPosition('Nebenkosten Halle', 595),
      newPosition('Halle', 345.1, [PER_DAY]),
      newPosition('Bus', 1485),
      newPosition('Programm', 200),
      newPosition('2x Begleitfahrzeug', 168),
      newPosition('Zugtickets', 400, [perParticipantGroup(10)]),
    ],
    credit: [
      newPosition('Teilnehmerbeitrag', 60, [PER_PARTICIPANT]),
      newPosition('Leiterbeitrag', 0, [PER_LEADER]),
      newPosition('Förderung DV Münster', 3.5, [PER_PERSON, PER_DAY]),
      newPosition('Förderung Leiter Dinslaken', 7, [perParticipantGroup(8), PER_DAY]),
      newPosition('Förderung Teilnehmer Dinslaken', 4, [perCity(dinslaken), PER_NIGHT]),
      newPosition('Förderung Teilnehmer Voerde', 2.9, [perCity(voerde), PER_NIGHT]),
      newPosition('Förderung Teilnehmer Hünxe/Wesel', 3.5, [perCity(huenxeWesel), PER_NIGHT]),
      newPosition('Bildungsstunden', 2.5 * 10, [PER_PERSON]),
      newPosition('Großzügige Spende', 4000)
    ],
  };
}

/** Plan ohne Städte und Positionen; Tage und Leiter wie im Beispiel. */
export function emptyPlan(): Plan {
  return {
    name: '',
    days: {start: 2, end: 3},
    leaders: {start: 2, end: 8},
    cities: [othersCity()],
    debit: [],
    credit: [],
  };
}
