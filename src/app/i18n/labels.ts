import {PlanFileError, RangeField} from '../calculation/plan';
import {City} from '../calculation/city';
import {FixedModifier, GroupModifier, PerCityModifier, PositionModifier} from '../calculation/modifiers';
import {Messages} from './de';

/**
 * Beschriftungen für Teile des Modells. Der Rechenkern kennt keine Sprachen; was er benennt, übersetzt erst die
 * Oberfläche.
 */

/** „Sonstige“ heißt in jeder Sprache anders; andere Städte tragen den Namen, den man ihnen gibt. */
export function cityName(city: City, t: Messages): string {
  return city.isOthers() ? t.common.others : city.getName();
}

export function describeModifier(modifier: PositionModifier, t: Messages): string {
  if (modifier instanceof PerCityModifier) {
    return t.modifiers.city(cityName(modifier.getCity(), t));
  }
  if (modifier instanceof GroupModifier) {
    return t.modifiers[modifier.kind](modifier.getGroupSize());
  }
  return t.modifiers[(modifier as FixedModifier).kind];
}

/** Die Meldung zu einem Fehler beim Öffnen einer Datei; unbekannte Fehler behalten ihren eigenen Text. */
export function fileErrorMessage(error: unknown, t: Messages): string {
  if (!(error instanceof PlanFileError)) {
    return error instanceof Error ? error.message : t.topBar.openFailed;
  }
  const fields: Record<RangeField, string> = {
    participants: t.common.participantsTotal, days: t.common.days, leaders: t.common.leaders,
  };
  const side: string = error.subject === 'credit' ? t.common.credit : t.common.debit;
  switch (error.code) {
    case 'invalidRange':
      return t.planFile.invalidRange(fields[error.subject as RangeField] ?? error.subject);
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
