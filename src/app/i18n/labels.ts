import {ContextType} from '../calculation/context';
import {PlanFileError} from '../calculation/plan';
import {City} from '../calculation/city';
import {Modifier} from '../calculation/modifiers';
import {Messages} from './de';

/**
 * Beschriftungen für Teile des Modells. Der Rechenkern kennt keine Sprachen; was er benennt, übersetzt erst die
 * Oberfläche.
 */

/** „Sonstige“ heißt in jeder Sprache anders; andere Städte tragen den Namen, den man ihnen gibt. */
export function cityName(city: City, t: Messages): string {
  return city.others ? t.common.others : city.name;
}

/** `cities`: die Städte des Plans, auf die ein Faktor „pro Teilnehmer aus …“ verweisen kann. */
export function describeModifier(modifier: Modifier, cities: readonly City[], t: Messages): string {
  switch (modifier.kind) {
    case 'city': {
      const city: City | undefined = cities.find(({id}: City): boolean => id === modifier.city);
      return t.modifiers.city(city ? cityName(city, t) : '?');
    }
    case 'personGroup':
    case 'participantGroup':
      return t.modifiers[modifier.kind](modifier.groupSize);
    default:
      return t.modifiers[modifier.kind];
  }
}

/** Die Meldung zu einem Fehler beim Öffnen einer Datei; unbekannte Fehler behalten ihren eigenen Text. */
export function fileErrorMessage(error: unknown, t: Messages): string {
  if (!(error instanceof PlanFileError)) {
    return error instanceof Error ? error.message : t.topBar.openFailed;
  }
  const fields: Record<ContextType, string> = {
    participants: t.common.participantsTotal, days: t.common.days, leaders: t.common.leaders,
  };
  const side: string = error.subject === 'credit' ? t.common.credit : t.common.debit;
  switch (error.code) {
    case 'invalidRange':
      return t.planFile.invalidRange(fields[error.subject as ContextType] ?? error.subject);
    case 'invalidCityRange':
      return t.planFile.invalidRange(error.subject);
    case 'unknownModifier':
      return t.planFile.unknownModifier(error.subject);
    case 'missingPositions':
      return t.planFile.missingPositions(side);
    case 'invalidPosition':
      return t.planFile.invalidPosition(side);
    default:
      return t.planFile[error.code];
  }
}
