import {ContextType} from '../calculation/context';
import {Side} from '../calculation/plan';
import {PlanFileError, PlanFileProblem} from '../calculation/plan-file';
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
  const sides: Record<Side, string> = {debit: t.common.debit, credit: t.common.credit};
  const problem: PlanFileProblem = error.problem;
  switch (problem.code) {
    case 'invalidRange':
      return t.planFile.invalidRange(fields[problem.subject]);
    case 'invalidCityRange':
      return t.planFile.invalidRange(problem.subject);
    case 'unknownModifier':
      return t.planFile.unknownModifier(problem.subject);
    case 'missingPositions':
      return t.planFile.missingPositions(sides[problem.subject]);
    case 'invalidPosition':
      return t.planFile.invalidPosition(sides[problem.subject]);
    default:
      return t.planFile[problem.code];
  }
}
