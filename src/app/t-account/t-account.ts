import {Component, computed, inject} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {LanguageStore} from '../language-store';
import {PlanCalculation} from '../plan-calculation';
import {PlanStore} from '../plan-store';
import {PositionTableComponent} from '../position-table/position-table';
import {EMPTY_VALUE_RANGE, ValueRange} from '../value-range';

/** Einnahmen und Ausgaben als T-Konto, jede Seite mit ihren Positionen und ihrer Summe. */
@Component({
  imports: [
    MatCardModule,
    MatIconModule,
    PositionTableComponent,
    CurrencyRangePipe,
  ],
  selector: 'app-t-account',
  styleUrl: './t-account.css',
  templateUrl: './t-account.html',
})
export class TAccount {

  private readonly store = inject(PlanStore);
  private readonly calculation = inject(PlanCalculation);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly plan = this.store.plan;
  protected readonly perParticipant = this.store.perParticipant;

  /** Skelette statt veralteter Zahlen, solange gerechnet wird. */
  protected readonly loading = this.calculation.skeleton;
  protected readonly debitTotal = computed((): ValueRange => this.calculation.result()?.calculation.debitTotal ?? EMPTY_VALUE_RANGE);
  protected readonly creditTotal = computed((): ValueRange => this.calculation.result()?.calculation.creditTotal ?? EMPTY_VALUE_RANGE);
  protected readonly positionSums = computed((): Map<string, ValueRange> =>
    this.calculation.result()?.positionSums ?? new Map<string, ValueRange>());
}
