import {inject, Injectable, Injector, signal, Signal} from '@angular/core';
import {Plan} from './calculation/plan';
import {City, ContextRange, ContextType, Position, PositionModifier} from './calculation/position';
import {PlanCalculation, PlanResult} from './plan-calculation';
import {fileName, PlanStore} from './plan-store';
import {ValueRange} from './value-range';
import {whenSignal} from './when-signal';
import {ChartKind, ChartSource, Report, ReportChart, ReportCity, ReportPosition} from './report';

const ZERO: ValueRange = {min: 0, max: 0};

/**
 * Erstellt die PDF aus dem Plan im {@link PlanStore} und dem Ergebnis der {@link PlanCalculation}. Die Diagramme
 * melden sich selbst an; solange sie noch nicht geladen sind, fordert die PDF sie über {@link chartsRequested} an.
 */
@Injectable({providedIn: 'root'})
export class PdfExport {

  private readonly store = inject(PlanStore);
  private readonly calculation = inject(PlanCalculation);

  private readonly chartsSignal = signal<Partial<Record<ChartKind, ChartSource>>>({});
  private readonly requested = signal<boolean>(false);
  /** Wird gesetzt, sobald die PDF Diagramme braucht, die noch nicht geladen sind (sie werden erst beim Scrollen geladen). */
  readonly chartsRequested: Signal<boolean> = this.requested.asReadonly();
  private readonly injector = inject(Injector);

  /** Ein Diagramm meldet sich an; die zurückgegebene Funktion meldet es wieder ab. */
  registerChart(kind: ChartKind, source: ChartSource): () => void {
    this.chartsSignal.update((charts) => ({...charts, [kind]: source}));
    return (): void => this.chartsSignal.update((charts) => charts[kind] === source ? {...charts, [kind]: undefined} : charts);
  }

  /** Was die PDF zeigt, mit dem Ergebnis der aktuellen Eingaben statt dem einer überholten Rechnung. */
  async report(): Promise<Report> {
    const result: PlanResult = await this.calculation.latest();
    const plan: Plan = this.store.plan();
    const contextRange: ContextRange = plan.contextRange;
    const position = (p: Position): ReportPosition => ({
      title: p.getTitle(),
      amount: p.getAmount(),
      factors: p.getModifiers().map((modifier: PositionModifier): string => modifier.getDescription()).join(' × '),
      sum: result.positionSums.get(p) ?? ZERO,
    });
    const scenarioCount: number = result.results.scenarioCount;
    const [chart, distribution] = await this.chartImages();
    return {
      name: this.store.name(),
      perParticipant: this.store.perParticipant(),
      days: contextRange.get(ContextType.DAYS),
      leaders: contextRange.get(ContextType.LEADERS),
      participants: scenarioCount > 0 ? contextRange.get(ContextType.PARTICIPANTS) : {start: 0, end: 0},
      cities: contextRange.getCities().map((city: City): ReportCity =>
        ({name: city.getName(), participants: city.getParticipants()})),
      scenarioCount,
      deficitShare: result.results.deficitShare(),
      debit: plan.debit.map(position),
      credit: plan.credit.map(position),
      debitTotal: result.calculation.debitTotal,
      creditTotal: result.calculation.creditTotal,
      balance: result.calculation.balance,
      chart,
      distribution,
    };
  }

  /** Wartet, bis beide Diagramme angemeldet sind, und rendert sie für Papier. */
  private async chartImages(): Promise<[ReportChart | null, ReportChart | null]> {
    const ready = (charts: Partial<Record<ChartKind, ChartSource>>): charts is Record<ChartKind, ChartSource> =>
      charts.scenario !== undefined && charts.distribution !== undefined;
    if (!ready(this.chartsSignal())) {
      this.requested.set(true);
    }
    const charts: Record<ChartKind, ChartSource> = await whenSignal(this.chartsSignal, ready, this.injector);
    return Promise.all([charts.scenario.printImage(), charts.distribution.printImage()]);
  }

  async download(): Promise<void> {
    const report: Report = await this.report();
    // Layout und jsPDF erst bei Bedarf laden, damit sie den Start der App nicht verlangsamen
    const {renderPdf} = await import('./pdf-layout');
    renderPdf(report).save(fileName(report.name, 'pdf'));
  }
}
