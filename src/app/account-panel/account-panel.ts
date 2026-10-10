import {ChangeDetectorRef, Component, DestroyRef, effect, inject, viewChild} from '@angular/core';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {City, Context, ContextRange, ContextType, PerCityModifier, Position, Range} from '../calculation/position';
import {ScenarioCache, ScenarioResults} from '../calculation/scenarios';
import {Calculation, Calculator} from '../calculation/calculator';
import {PlanStore} from '../plan-store';
import {ThemeStore} from '../theme-store';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {PositionTableComponent} from '../position-table/position-table';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {ValueRange} from '../value-range';
import {PdfExport, Report, ReportPosition} from '../pdf-export';
import {ScenarioChart} from '../charts/scenario-chart/scenario-chart';
import {DistributionChart} from '../charts/distribution-chart/distribution-chart';

interface ContextRow {
  type: ContextType;
  label: string;
  icon: string;
  min: number;
}

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    FormsModule,
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
    {type: ContextType.DAYS, label: 'Tage', icon: 'calendar_month', min: 1},
    {type: ContextType.LEADERS, label: 'Leiter', icon: 'supervisor_account', min: 0},
  ];

  protected balance: ValueRange = {min: 0, max: 0};
  protected debitTotal: ValueRange = {min: 0, max: 0};
  protected creditTotal: ValueRange = {min: 0, max: 0};
  protected positionSums: Map<Position, ValueRange> = new Map<Position, ValueRange>();
  protected scenarioCount: number = 0;

  private readonly scenarioCache = new ScenarioCache();
  private readonly calculator = new Calculator();
  protected results!: ScenarioResults;
  protected calculation!: Calculation;
  /** Wird bei jeder Rechnung erhöht, damit die Diagramme neu zeichnen. */
  protected version: number = 0;

  private readonly scenarioChart = viewChild.required(ScenarioChart);
  private readonly distributionChart = viewChild.required(DistributionChart);

  private readonly store = inject(PlanStore);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly theme = inject(ThemeStore);
  private readonly snackBar = inject(MatSnackBar);

  protected contextRange: ContextRange = this.store.plan().contextRange;
  protected debit: Position[] = this.store.plan().debit;
  protected credit: Position[] = this.store.plan().credit;

  protected perParticipant: boolean = false;

  protected readonly name = this.store.name;

  public constructor() {
    const pdfExport: PdfExport = inject(PdfExport);
    pdfExport.setSource((): Promise<Report> => this.report());
    inject(DestroyRef).onDestroy((): void => pdfExport.setSource(null));
    effect((): void => {
      const plan = this.store.plan();
      this.contextRange = plan.contextRange;
      this.debit = plan.debit;
      this.credit = plan.credit;
      this.perParticipant = this.store.perParticipant();
      // Die Diagramme lesen die Theme-Farben beim Aufbau aus und müssen nach einem Wechsel neu gezeichnet werden
      this.theme.dark();
      this.compute();
      // Ohne Zone bemerkt Angular die hier gesetzten Felder sonst nicht, wenn die Änderung von außen kommt (z. B. Header)
      this.changeDetector.markForCheck();
    });
  }

  protected setRange(type: ContextType, bound: 'start' | 'end', value: number | null): void {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    const row = this.contextRows.find((r: ContextRow): boolean => r.type === type);
    const range: Range = this.contextRange.get(type);
    range[bound] = Math.max(row?.min ?? 0, Math.round(value));
    if (range.start > range.end) {
      if (bound === 'start') {
        range.end = range.start;
      } else {
        range.start = range.end;
      }
    }
    this.compute();
  }

  protected rename(name: string): void {
    this.store.rename(name);
  }

  private async report(): Promise<Report> {
    const position = (p: Position): ReportPosition => ({
      title: p.getTitle(),
      amount: p.getAmount(),
      factors: p.getModifiers().map((modifier): string => modifier.getDescription()).join(' × '),
      sum: this.positionSums.get(p) ?? {min: 0, max: 0},
    });
    return {
      name: this.store.name(),
      perParticipant: this.perParticipant,
      days: this.contextRange.get(ContextType.DAYS),
      leaders: this.contextRange.get(ContextType.LEADERS),
      participants: this.scenarioCount > 0 ? this.contextRange.get(ContextType.PARTICIPANTS) : {start: 0, end: 0},
      cities: this.contextRange.getCities().map((city: City) => ({name: city.getName(), participants: city.getParticipants()})),
      scenarioCount: this.scenarioCount,
      deficitShare: this.deficitShare(),
      debit: this.debit.map(position),
      credit: this.credit.map(position),
      debitTotal: this.debitTotal,
      creditTotal: this.creditTotal,
      balance: this.balance,
      chart: await this.scenarioChart().printImage(),
      distribution: await this.distributionChart().printImage(),
    };
  }

  protected participantsLabel(): string {
    const total: Range = this.contextRange.get(ContextType.PARTICIPANTS);
    if (total.end === 0) {
      return '0';
    }
    return total.start === total.end ? `${total.start}` : `${total.start}–${total.end}`;
  }

  protected setCityName(city: City, name: string): void {
    city.setName(name);
    this.compute();
  }

  protected setCityRange(city: City, bound: 'start' | 'end', value: number | null): void {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    const participants: Range = city.getParticipants();
    participants[bound] = Math.max(0, Math.round(value));
    if (participants.start > participants.end) {
      if (bound === 'start') {
        participants.end = participants.start;
      } else {
        participants.start = participants.end;
      }
    }
    this.compute();
  }

  protected addCity(): void {
    this.contextRange.addCity(new City('Neue Stadt', {start: 0, end: 10}));
    this.compute();
  }

  protected removeCity(city: City): void {
    const users: Position[] = [...this.debit, ...this.credit].filter((position: Position): boolean =>
      position.getModifiers().some((modifier): boolean => modifier instanceof PerCityModifier && modifier.getCity() === city));
    if (users.length > 0) {
      const titles: string = users.map((position: Position): string => `„${position.getTitle()}“`).join(', ');
      this.snackBar.open(`${city.getName()} wird noch verwendet in ${titles}.`, 'OK', {duration: 6000});
      return;
    }
    const index: number = this.contextRange.removeCity(city);
    this.compute();
    this.snackBar
      .open(`„${city.getName()}“ gelöscht`, 'Rückgängig', {duration: 5000})
      .onAction()
      .subscribe((): void => {
        this.contextRange.addCity(city, index);
        this.compute();
      });
  }

  /**
   * Rechnet alle Szenarien durch: je Position, je Kontoseite und als Überschuss. Szenarien und Ergebnisse kommen
   * aus dem Cache, solange sich die zugrunde liegenden Zahlen nicht geändert haben.
   */
  protected compute(): void {
    const relevant: City[] = this.referencedCities();
    const permutations: Context[] = this.scenarioCache.getContexts(this.contextRange, relevant);
    const calculation: Calculation = this.calculator.calculate(permutations, this.contextRange, this.debit, this.credit,
      this.perParticipant);
    this.balance = calculation.balance;
    this.debitTotal = calculation.debitTotal;
    this.creditTotal = calculation.creditTotal;
    this.positionSums = calculation.positionSums;

    if (this.results?.values !== calculation.values) {
      this.results = new ScenarioResults(permutations, calculation.values, this.contextRange, relevant);
    }
    this.calculation = calculation;
    // Zusammengefasste Städte zählen mit ihrem Gewicht: so viele Szenarien wie bei vollständiger Aufzählung
    this.scenarioCount = this.results.scenarioCount;
    this.version++;
    this.store.autosave();
  }

  /** Anteil der Szenarien mit Defizit; zusammengefasste Szenarien zählen mit ihrem Gewicht. */
  private deficitShare(): number {
    const weights: Float64Array = this.results.weights;
    let deficit: number = 0;
    this.calculation.values.forEach((value: number, i: number): void => {
      deficit += value < 0 ? weights[i] : 0;
    });
    return this.results.scenarioCount > 0 ? deficit / this.results.scenarioCount : 0;
  }

  /** Städte, auf die ein Faktor „pro Teilnehmer aus …“ verweist. */
  private referencedCities(): City[] {
    return [...this.debit, ...this.credit]
      .flatMap((position: Position) => position.getModifiers())
      .filter((modifier): modifier is PerCityModifier => modifier instanceof PerCityModifier)
      .map((modifier: PerCityModifier): City => modifier.getCity());
  }
}
