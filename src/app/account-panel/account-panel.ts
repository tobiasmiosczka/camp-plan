import {Component, computed, DestroyRef, effect, inject, signal, Signal, untracked, viewChild} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {toObservable} from '@angular/core/rxjs-interop';
import {filter, firstValueFrom} from 'rxjs';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {City, ContextRange, ContextType, Position, Range} from '../calculation/position';
import {Plan} from '../calculation/plan';
import {PlanCalculation} from '../plan-calculation';
import {PlanStore, RANGE_MIN} from '../plan-store';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {PositionTableComponent} from '../position-table/position-table';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {ValueRange} from '../value-range';
import {PdfExport, Report, ReportChart, ReportPosition} from '../pdf-export';
import {ScenarioChart} from '../charts/scenario-chart/scenario-chart';
import {DistributionChart} from '../charts/distribution-chart/distribution-chart';

interface ContextRow {
  type: ContextType.DAYS | ContextType.LEADERS;
  label: string;
  icon: string;
  min: number;
}

const ZERO: ValueRange = {min: 0, max: 0};
const ZERO_RANGE: Range = {start: 0, end: 0};

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    FormsModule,
    NgTemplateOutlet,
    PositionTableComponent,
    CurrencyRangePipe,
    ScenarioChart,
    DistributionChart,
  ],
  selector: 'app-account-panel',
  styleUrl: './account-panel.css',
  templateUrl: './account-panel.html',
})
export class AccountPanel {

  protected readonly contextRows: ContextRow[] = [
    {type: ContextType.DAYS, label: 'Tage', icon: 'calendar_month', min: RANGE_MIN[ContextType.DAYS]},
    {type: ContextType.LEADERS, label: 'Leiter', icon: 'supervisor_account', min: RANGE_MIN[ContextType.LEADERS]},
  ];

  private readonly store = inject(PlanStore);
  private readonly calculation = inject(PlanCalculation);
  private readonly snackBar = inject(MatSnackBar);

  // Über den Namen statt die Klasse abgefragt: Ein Verweis auf die Klasse würde die Diagramme mitsamt Plotly sofort laden
  private readonly scenarioChart = viewChild<ScenarioChart>('scenarioChart');
  private readonly distributionChart = viewChild<DistributionChart>('distributionChart');
  /** Lädt die Diagramme auch ohne Scrollen, etwa weil die PDF sie braucht. */
  protected readonly chartsRequested = signal<boolean>(false);
  private readonly charts: Signal<[ScenarioChart, DistributionChart] | null> = computed(() => {
    const scenario: ScenarioChart | undefined = this.scenarioChart();
    const distribution: DistributionChart | undefined = this.distributionChart();
    return scenario && distribution ? [scenario, distribution] : null;
  });
  private readonly charts$ = toObservable(this.charts);

  protected readonly plan = this.store.plan;
  protected readonly name = this.store.name;
  protected readonly perParticipant = this.store.perParticipant;
  protected readonly contextRange = computed((): ContextRange => this.plan().contextRange);

  /** Bis zum ersten Ergebnis null; die Diagramme erscheinen erst, wenn es da ist. */
  protected readonly result = this.calculation.result;
  /** Skelette statt veralteter Zahlen, solange gerechnet wird. */
  protected readonly loading = this.calculation.skeleton;
  protected readonly balance = computed((): ValueRange => this.result()?.calculation.balance ?? ZERO);
  protected readonly debitTotal = computed((): ValueRange => this.result()?.calculation.debitTotal ?? ZERO);
  protected readonly creditTotal = computed((): ValueRange => this.result()?.calculation.creditTotal ?? ZERO);
  protected readonly positionSums = computed((): Map<Position, ValueRange> =>
    this.result()?.positionSums ?? new Map<Position, ValueRange>());
  /** Zusammengefasste Städte zählen mit ihrem Gewicht: so viele Szenarien wie bei vollständiger Aufzählung. */
  protected readonly scenarioCount = computed((): number => this.result()?.results.scenarioCount ?? 0);

  public constructor() {
    const pdfExport: PdfExport = inject(PdfExport);
    pdfExport.setSource((): Promise<Report> => this.report());
    inject(DestroyRef).onDestroy((): void => pdfExport.setSource(null));
    effect((): void => {
      const error: Error | undefined = this.calculation.error();
      if (error) {
        untracked((): void => {
          this.snackBar.open(`Berechnung fehlgeschlagen: ${error.message}`, 'Erneut versuchen')
            .onAction()
            .subscribe((): void => this.calculation.retry());
        });
      }
    });
  }

  protected setRange(type: ContextType.DAYS | ContextType.LEADERS, bound: keyof Range, value: number | null): void {
    if (value !== null) {
      this.store.setRange(type, bound, value);
    }
  }

  protected rename(name: string): void {
    this.store.rename(name);
  }

  protected participantsLabel(): string {
    const total: Range = this.contextRange().get(ContextType.PARTICIPANTS);
    if (total.end === 0) {
      return '0';
    }
    return total.start === total.end ? `${total.start}` : `${total.start}–${total.end}`;
  }

  protected setCityName(city: City, name: string): void {
    this.store.setCityName(city, name);
  }

  protected setCityRange(city: City, bound: keyof Range, value: number | null): void {
    if (value !== null) {
      this.store.setCityRange(city, bound, value);
    }
  }

  protected addCity(): void {
    this.store.addCity();
  }

  protected removeCity(city: City): void {
    const users: Position[] = this.store.usersOf(city);
    if (users.length > 0) {
      const titles: string = users.map((position: Position): string => `„${position.getTitle()}“`).join(', ');
      this.snackBar.open(`${city.getName()} wird noch verwendet in ${titles}.`, 'OK', {duration: 6000});
      return;
    }
    const index: number = this.store.removeCity(city);
    this.snackBar
      .open(`„${city.getName()}“ gelöscht`, 'Rückgängig', {duration: 5000})
      .onAction()
      .subscribe((): void => this.store.restoreCity(city, index));
  }

  private async report(): Promise<Report> {
    // Die PDF zeigt das Ergebnis der aktuellen Eingaben, nicht das einer überholten Rechnung
    await this.calculation.whenIdle();
    const plan: Plan = this.plan();
    const contextRange: ContextRange = plan.contextRange;
    const sums: Map<Position, ValueRange> = this.positionSums();
    const position = (p: Position): ReportPosition => ({
      title: p.getTitle(),
      amount: p.getAmount(),
      factors: p.getModifiers().map((modifier): string => modifier.getDescription()).join(' × '),
      sum: sums.get(p) ?? ZERO,
    });
    return {
      name: this.name(),
      perParticipant: this.perParticipant(),
      days: contextRange.get(ContextType.DAYS),
      leaders: contextRange.get(ContextType.LEADERS),
      participants: this.scenarioCount() > 0 ? contextRange.get(ContextType.PARTICIPANTS) : ZERO_RANGE,
      cities: contextRange.getCities().map((city: City) => ({name: city.getName(), participants: city.getParticipants()})),
      scenarioCount: this.scenarioCount(),
      deficitShare: this.result()?.results.deficitShare() ?? 0,
      debit: plan.debit.map(position),
      credit: plan.credit.map(position),
      debitTotal: this.debitTotal(),
      creditTotal: this.creditTotal(),
      balance: this.balance(),
      ...await this.chartImages(),
    };
  }

  /** Lädt die Diagramme nach, falls sie noch nicht im Bild waren, und rendert sie für Papier. */
  private async chartImages(): Promise<{ chart: ReportChart | null, distribution: ReportChart | null }> {
    if (this.result() === null) {
      return {chart: null, distribution: null};
    }
    this.chartsRequested.set(true);
    const [scenario, distribution] = await firstValueFrom(this.charts$.pipe(
      filter((charts): charts is [ScenarioChart, DistributionChart] => charts !== null)));
    return {chart: await scenario.printImage(), distribution: await distribution.printImage()};
  }
}
