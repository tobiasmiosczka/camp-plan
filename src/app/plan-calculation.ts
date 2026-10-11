import {computed, effect, inject, Injectable, linkedSignal, resource, signal} from '@angular/core';
import {toObservable} from '@angular/core/rxjs-interop';
import {filter, firstValueFrom, Observable} from 'rxjs';
import {calculationKey, EngineResult} from './calculation/engine';
import {Plan, planToJson} from './calculation/plan';
import {Position} from './calculation/position';
import {ScenarioResults} from './calculation/scenarios';
import {CalculationRunner} from './calculation-runner';
import {PlanStore} from './plan-store';
import {ValueRange} from './value-range';

/** Ein vollständiges Ergebnis, den Positionen und Städten des Plans wieder zugeordnet. */
export interface PlanResult {
  calculation: EngineResult;
  results: ScenarioResults;
  positionSums: Map<Position, ValueRange>;
}

interface Request {
  json: string;
  perParticipant: boolean;
  /** Alle Zahlen des Plans ohne Titel und Namen; nur wenn er sich ändert, wird neu gerechnet. */
  key: string;
}

/**
 * Rechnet den Plan aus dem {@link PlanStore} im Web Worker, sobald sich eine Zahl ändert. Eine neue Änderung bricht
 * die laufende Rechnung ab (`resource` reicht dafür ein `AbortSignal` an den {@link CalculationRunner}).
 */
@Injectable({providedIn: 'root'})
export class PlanCalculation {

  private readonly store = inject(PlanStore);
  private readonly runner = inject(CalculationRunner);

  private readonly request = computed((): Request => {
    // Das Modell wird an Ort und Stelle geändert; erst die Revision macht daraus eine neue Anfrage
    this.store.revision();
    const json: string = planToJson(this.store.plan());
    const perParticipant: boolean = this.store.perParticipant();
    return {json, perParticipant, key: calculationKey(json, perParticipant)};
  }, {equal: (a: Request, b: Request): boolean => a.key === b.key});

  private readonly resource = resource({
    params: (): Request => this.request(),
    loader: async ({params, abortSignal}): Promise<PlanResult> => {
      // Die Ergebnisse kommen als Listen zurück; so lassen sie sich wieder den Positionen zuordnen. Jede Änderung an
      // Positionen oder Städten hätte eine neue Anfrage ausgelöst und diese hier abgebrochen.
      const plan: Plan = this.store.plan();
      const positions: Position[] = [...plan.debit, ...plan.credit];
      const calculation: EngineResult = await this.runner.run(params.json, params.perParticipant, abortSignal);
      return {
        calculation,
        results: new ScenarioResults(calculation.scenarios, calculation.values, plan.contextRange),
        positionSums: new Map<Position, ValueRange>(positions.map((position: Position, i: number): [Position, ValueRange] =>
          [position, calculation.positionSums[i]])),
      };
    },
  });

  /** Das letzte vollständige Ergebnis; es bleibt stehen, während neu gerechnet wird. Vor dem ersten: null. */
  readonly result = linkedSignal<PlanResult | undefined, PlanResult | null>({
    source: (): PlanResult | undefined => this.resource.hasValue() ? this.resource.value() : undefined,
    computation: (value: PlanResult | undefined, previous?: { value: PlanResult | null }): PlanResult | null =>
      value ?? previous?.value ?? null,
  });

  readonly error = computed((): Error | undefined => this.resource.error());

  private readonly skeletonSignal = signal<boolean>(true);
  /**
   * Skelette statt veralteter Zahlen. Kurze Rechnungen flackern nicht: Nach dem ersten Ergebnis erscheint das
   * Skelett erst, wenn eine Rechnung spürbar dauert.
   */
  readonly skeleton = this.skeletonSignal.asReadonly();

  private readonly loading$: Observable<boolean> = toObservable(this.resource.isLoading);

  constructor() {
    effect((onCleanup): void => {
      if (!this.resource.isLoading()) {
        this.skeletonSignal.set(false);
      } else if (this.result() === null) {
        this.skeletonSignal.set(true);
      } else {
        const timer: ReturnType<typeof setTimeout> = setTimeout((): void => this.skeletonSignal.set(true), 150);
        onCleanup((): void => clearTimeout(timer));
      }
    });
  }

  /** Erfüllt sich, sobald keine Rechnung mehr läuft, z. B. bevor die PDF entsteht. */
  whenIdle(): Promise<boolean> {
    return firstValueFrom(this.loading$.pipe(filter((loading: boolean): boolean => !loading)));
  }

  /** Versucht dieselbe Rechnung erneut, etwa nach einem Fehler. */
  retry(): void {
    this.resource.reload();
  }
}
