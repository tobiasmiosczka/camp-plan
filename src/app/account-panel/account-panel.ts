import {Component, computed, effect, inject, Signal, untracked} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {City, ContextRange, ContextType, Position, Range} from '../calculation/position';
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
import {PdfExport} from '../pdf-export';
import {ScenarioChart} from '../charts/scenario-chart/scenario-chart';
import {DistributionChart} from '../charts/distribution-chart/distribution-chart';

interface ContextRow {
  type: ContextType.DAYS | ContextType.LEADERS;
  label: string;
  icon: string;
  min: number;
}

const ZERO: ValueRange = {min: 0, max: 0};

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

  /** Lädt die Diagramme auch ohne Scrollen, weil die PDF sie braucht. */
  protected readonly chartsRequested: Signal<boolean> = inject(PdfExport).chartsRequested;

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
}
