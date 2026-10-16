import {Plan, withOthersLast} from '../calculation/plan';
import {emptyPlan} from '../calculation/starter-plans';

/**
 * Ein Plan für Tests: leer bis auf das Angegebene. „Sonstige“ wird ergänzt, wie in jedem Plan; Tage und Leiter wie im
 * leeren Plan, wenn nicht angegeben.
 */
export function planWith(parts: Partial<Plan> = {}): Plan {
  return {...emptyPlan(), ...parts, cities: withOthersLast(parts.cities ?? [])};
}

/** Die Liste mit geändertem Element an der Stelle `index`; der Rest bleibt, wie er ist. */
export function changedAt<T>(items: readonly T[], index: number, change: (item: T) => T): T[] {
  return items.map((item: T, i: number): T => i === index ? change(item) : item);
}
