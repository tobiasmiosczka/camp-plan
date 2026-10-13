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
import {TAccount} from '../t-account/t-account';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {ValueRange} from '../value-range';
import {PdfExport} from '../pdf-export';
import {cityName} from '../i18n/labels';
import {LanguageStore} from '../language-store';
import {ScenarioChart} from '../charts/scenario-chart/scenario-chart';
import {DistributionChart} from '../charts/distribution-chart/distribution-chart';

interface ContextRow {
  type: ContextType.DAYS | ContextType.LEADERS;
  label: 'days' | 'leaders';
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
    TAccount,
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
    {type: ContextType.DAYS, label: 'days', icon: 'calendar_month', min: RANGE_MIN[ContextType.DAYS]},
    {type: ContextType.LEADERS, label: 'leaders', icon: 'supervisor_account', min: RANGE_MIN[ContextType.LEADERS]},
  ];

  private readonly store = inject(PlanStore);
  private readonly calculation = inject(PlanCalculation);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly t = inject(LanguageStore).messages;

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
  /** Zusammengefasste Städte zählen mit ihrem Gewicht: so viele Szenarien wie bei vollständiger Aufzählung. */
  protected readonly scenarioCount = computed((): number => this.result()?.results.scenarioCount ?? 0);

  public constructor() {
    effect((): void => {
      const error: Error | undefined = this.calculation.error();
      if (error) {
        untracked((): void => {
          const t = this.t();
          this.snackBar.open(t.summary.calculationFailed(error.message), t.summary.retry)
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

  protected cityName(city: City): string {
    return cityName(city, this.t());
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
    const t = this.t();
    const users: Position[] = this.store.usersOf(city);
    if (users.length > 0) {
      const titles: string[] = users.map((position: Position): string => position.getTitle());
      this.snackBar.open(t.cities.inUse(city.getName(), titles), t.common.ok, {duration: 6000});
      return;
    }
    const index: number = this.store.removeCity(city);
    this.snackBar
      .open(t.common.deleted(city.getName()), t.common.undo, {duration: 5000})
      .onAction()
      .subscribe((): void => this.store.restoreCity(city, index));
  }
}
