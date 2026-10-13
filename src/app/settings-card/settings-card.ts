import {Component, computed, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {ContextRange, ContextType, Range} from '../calculation/position';
import {LanguageStore} from '../language-store';
import {PlanStore, RANGE_MIN} from '../plan-store';

interface ContextRow {
  type: ContextType.DAYS | ContextType.LEADERS;
  label: 'days' | 'leaders';
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
    {type: ContextType.DAYS, label: 'days', icon: 'calendar_month', min: RANGE_MIN[ContextType.DAYS]},
    {type: ContextType.LEADERS, label: 'leaders', icon: 'supervisor_account', min: RANGE_MIN[ContextType.LEADERS]},
  ];

  private readonly store = inject(PlanStore);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly contextRange = computed((): ContextRange => this.store.plan().contextRange);

  protected setRange(type: ContextType.DAYS | ContextType.LEADERS, bound: keyof Range, value: number | null): void {
    if (value !== null) {
      this.store.setRange(type, bound, value);
    }
  }
}
