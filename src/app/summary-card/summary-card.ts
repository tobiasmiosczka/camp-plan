import {Component, computed, inject} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {LanguageStore} from '../language-store';
import {PlanCalculation} from '../plan-calculation';
import {PlanStore} from '../plan-store';
import {EMPTY_VALUE_RANGE, ValueRange} from '../value-range';

/** Die zentrale Kennzahl: Überschuss über alle Szenarien, mit Hinweis, wenn ein Defizit möglich ist. */
@Component({
  imports: [MatCardModule, MatIconModule, CurrencyRangePipe],
  selector: 'app-summary-card',
  styleUrl: './summary-card.css',
  templateUrl: './summary-card.html',
})
export class SummaryCard {

  private readonly calculation = inject(PlanCalculation);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly perParticipant = inject(PlanStore).perParticipant;
  /** Skelette statt veralteter Zahlen, solange gerechnet wird. */
  protected readonly loading = this.calculation.skeleton;
  protected readonly balance = computed((): ValueRange => this.calculation.result()?.calculation.balance ?? EMPTY_VALUE_RANGE);
  /** Zusammengefasste Städte zählen mit ihrem Gewicht: so viele Szenarien wie bei vollständiger Aufzählung. */
  protected readonly scenarioCount = computed((): number => this.calculation.result()?.results.scenarioCount ?? 0);
}
