import {computed, effect, inject, Injectable, Injector, linkedSignal, resource, signal} from '@angular/core';
import {calculationKey, EngineResult} from './calculation/engine';
import {Plan, positionsOf} from './calculation/plan';
import {Position} from './calculation/position';
import {ScenarioResults} from './calculation/scenarios';
import {CalculationRunner} from './calculation-runner';
import {PlanStore} from './plan-store';
import {ValueRange} from './value-range';
import {whenSignal} from './when-signal';

/** Ein vollständiges Ergebnis, den Positionen und Städten des Plans wieder zugeordnet. */
export interface PlanResult {
  /** Für welche Zahlen gerechnet wurde, siehe {@link calculationKey}. */
  key: string;
  calculation: EngineResult;
  results: ScenarioResults;
  /** Spanne je Positions-ID. */
  positionSums: Map<string, ValueRange>;
}

/** Erst ab dieser Rechendauer erscheint der Ladebalken; kürzere Rechnungen kommen mit dem Skelett aus. */
const LONG_CALCULATION_MS: number = 400;

interface Request {
  plan: Plan;
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
  private readonly injector = inject(Injector);

  private readonly request = computed((): Request => {
    const plan: Plan = this.store.plan();
    const perParticipant: boolean = this.store.perParticipant();
    return {plan, perParticipant, key: calculationKey(plan, perParticipant)};
  }, {equal: (a: Request, b: Request): boolean => a.key === b.key});

  private readonly progressSignal = signal<number | null>(null);
  /** Fortschritt einer Rechnung, die schon spürbar dauert, von 0 bis 1; sonst null. */
  readonly progress = this.progressSignal.asReadonly();
  /**
   * Seit wann ohne Pause gerechnet wird. Bricht eine neue Eingabe eine lange Rechnung ab, zählt die Zeit weiter:
   * Der Ladebalken bleibt dann stehen, statt kurz zu verschwinden.
   */
  private busySince: number | null = null;

  private readonly resource = resource({
    params: (): Request => this.request(),
    loader: async ({params, abortSignal}): Promise<PlanResult> => {
      // Die Ergebnisse kommen als Listen in der Reihenfolge des Plans zurück; über ihn finden sie zu den IDs
      const positions: Position[] = positionsOf(params.plan);
      const busySince: number = this.busySince ??= performance.now();
      const onProgress = (share: number): void => {
        if (!abortSignal.aborted && performance.now() - busySince >= LONG_CALCULATION_MS) {
          this.progressSignal.set(share);
        }
      };
      let calculation: EngineResult;
      try {
        calculation = await this.runner.run(params.plan, params.perParticipant, abortSignal, onProgress);
      } finally {
        // Abgebrochen heißt: Die nächste Rechnung läuft schon und übernimmt den Ladebalken
        if (!abortSignal.aborted) {
          this.busySince = null;
          this.progressSignal.set(null);
        }
      }
      return {
        key: params.key,
        calculation,
        results: new ScenarioResults(calculation.scenarios, calculation.values, params.plan),
        positionSums: new Map<string, ValueRange>(positions.map((position: Position, i: number): [string, ValueRange] =>
          [position.id, calculation.positionSums[i]])),
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

  /** Das Ergebnis der aktuellen Eingaben oder ihr Fehler; null, solange dafür noch gerechnet wird. */
  private readonly current = computed((): PlanResult | Error | null => {
    const error: Error | undefined = this.resource.error();
    if (error) {
      return error;
    }
    const result: PlanResult | null = this.result();
    return result?.key === this.request().key ? result : null;
  });

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

  /**
   * Das Ergebnis der aktuellen Eingaben, z. B. für die PDF; wartet, falls dafür noch gerechnet wird. Verglichen wird
   * der Schlüssel statt „lädt gerade nicht“: Direkt nach einer Änderung hat die Rechnung womöglich noch gar nicht
   * begonnen.
   */
  async latest(): Promise<PlanResult> {
    const current: PlanResult | Error = await whenSignal(this.current,
      (current: PlanResult | Error | null): current is PlanResult | Error => current !== null, this.injector);
    if (current instanceof Error) {
      throw current;
    }
    return current;
  }

  /** Versucht dieselbe Rechnung erneut, etwa nach einem Fehler. */
  retry(): void {
    this.resource.reload();
  }
}
