import {TestBed} from '@angular/core/testing';
import {Plan} from '../calculation/plan';
import {City, ContextRange, ContextType, PER_DAY, PER_PARTICIPANT, PER_PERSON, PerCityModifier, Position, Range} from '../calculation/position';
import {PlanStore} from '../plan-store';

/**
 * Ein Plan für Tests, klein genug zum Nachrechnen. Unabhängig vom Beispielplan der App: Der darf sich ändern, ohne
 * dass Tests mit seinen Zahlen brechen.
 *
 * 6 Szenarien: 0–2 Teilnehmer aus Aachen (A), genau 1 aus Bonn, 1–2 Leiter (L), immer 2 Tage. Mit T = A + 1 Teilnehmern:
 *
 *   Ausgaben   = 100 (Halle) + 10 · (T + L) · 2 (Essen)       → 140 € bis 200 €
 *   Einnahmen  = 60 · T (Beitrag) + 5 · A (Zuschuss Aachen)    →  60 € bis 190 €
 *   Überschuss = 45 · A − 60 − 20 · L                          → −100 € bis 10 €
 *
 * Die sechs Überschüsse: A = 0: −80 / −100, A = 1: −35 / −55, A = 2: 10 / −10 (jeweils L = 1 / L = 2).
 * Im Mittel −45 €, in 5 von 6 Szenarien ein Defizit.
 */
export function testPlan(): Plan {
  const aachen = new City('Aachen', {start: 0, end: 2});
  const bonn = new City('Bonn', {start: 1, end: 1});
  return {
    name: 'Testlager',
    contextRange: new ContextRange(new Map<ContextType, Range>([
      [ContextType.LEADERS, {start: 1, end: 2}],
      [ContextType.DAYS, {start: 2, end: 2}],
    ]), [aachen, bonn]),
    debit: [
      new Position('Halle', 100),
      new Position('Essen', 10, [PER_PERSON, PER_DAY]),
    ],
    credit: [
      new Position('Beitrag', 60, [PER_PARTICIPANT]),
      new Position('Zuschuss Aachen', 5, [new PerCityModifier(aachen)]),
    ],
  };
}

/** Lädt {@link testPlan} in den Store; vor allem, was den Plan liest oder rechnet. */
export function useTestPlan(): Plan {
  const plan: Plan = testPlan();
  TestBed.inject(PlanStore).plan.set(plan);
  return plan;
}
