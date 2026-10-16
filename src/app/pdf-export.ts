import {inject, Injectable, Injector, signal, Signal} from '@angular/core';
import {City} from './calculation/city';
import {Modifier} from './calculation/modifiers';
import {Plan, rangeOf} from './calculation/plan';
import {Position} from './calculation/position';
import {PlanCalculation, PlanResult} from './plan-calculation';
import {fileName} from './download';
import {PlanStore} from './plan-store';
import {EMPTY_VALUE_RANGE} from './value-range';
import {whenSignal} from './when-signal';
import {cityName, describeModifier} from './i18n/labels';
import {Messages} from './i18n/de';
import {LanguageStore} from './language-store';
import {ChartKind, ChartSource, Report, ReportChart, ReportCity, ReportPosition} from './report';

/**
 * Erstellt die PDF aus dem Plan im {@link PlanStore} und dem Ergebnis der {@link PlanCalculation}. Die Diagramme
 * melden sich selbst an; solange sie noch nicht geladen sind, fordert die PDF sie über {@link chartsRequested} an.
 */
@Injectable({providedIn: 'root'})
export class PdfExport {

  private readonly store = inject(PlanStore);
  private readonly calculation = inject(PlanCalculation);
  private readonly messages = inject(LanguageStore).messages;

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
    const t: Messages = this.messages();
    const position = (p: Position): ReportPosition => ({
      title: p.title,
      amount: p.amount,
      factors: p.modifiers.map((modifier: Modifier): string => describeModifier(modifier, plan.cities, t)).join(' × '),
      sum: result.positionSums.get(p.id) ?? EMPTY_VALUE_RANGE,
    });
    const scenarioCount: number = result.results.scenarioCount;
    const [chart, distribution] = await this.chartImages();
    return {
      name: this.store.name(),
      perParticipant: this.store.perParticipant(),
      days: plan.days,
      leaders: plan.leaders,
      participants: scenarioCount > 0 ? rangeOf(plan, 'participants') : {start: 0, end: 0},
      cities: plan.cities.map((city: City): ReportCity => ({name: cityName(city, t), participants: city.participants})),
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
    const {piggyBankImage, renderPdf} = await import('./pdf-layout');
    renderPdf(report, await piggyBankImage(), this.messages()).save(fileName(report.name, 'pdf'));
  }
}
