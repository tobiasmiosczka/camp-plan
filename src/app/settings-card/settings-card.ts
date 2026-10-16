import {Component, computed, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {AdjustableType} from '../calculation/context';
import {Plan} from '../calculation/plan';
import {Range} from '../calculation/range';
import {LanguageStore} from '../stores/language-store';
import {PlanStore, RANGE_MIN} from '../stores/plan-store';

interface ContextRow {
  type: AdjustableType;
  icon: string;
  min: number;
}

/** Tage und Leiter als Spannen, für die das Lager durchgerechnet wird. */
@Component({
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule],
  selector: 'app-settings-card',
  styleUrl: './settings-card.css',
  templateUrl: './settings-card.html',
})
export class SettingsCard {

  protected readonly contextRows: ContextRow[] = [
    {type: 'days', icon: 'calendar_month', min: RANGE_MIN.days},
    {type: 'leaders', icon: 'supervisor_account', min: RANGE_MIN.leaders},
  ];

  private readonly store = inject(PlanStore);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly plan = computed((): Plan => this.store.plan());

  protected setRange(type: AdjustableType, bound: keyof Range, value: number | null): void {
    if (value !== null) {
      this.store.setRange(type, bound, value);
    }
  }
}
