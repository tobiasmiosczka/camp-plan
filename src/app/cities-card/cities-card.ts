import {Component, computed, inject} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import {City} from '../calculation/city';
import {Plan, rangeOf} from '../calculation/plan';
import {Position} from '../calculation/position';
import {Range} from '../calculation/range';
import {cityName} from '../i18n/labels';
import {LanguageStore} from '../stores/language-store';
import {PlanStore, Removed} from '../stores/plan-store';
import {Undo} from '../stores/undo';

/** Die Städte, aus denen Teilnehmende kommen, je mit einer Spanne an Teilnehmern. */
@Component({
  imports: [
    FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule,
  ],
  selector: 'app-cities-card',
  styleUrl: './cities-card.css',
  templateUrl: './cities-card.html',
})
export class CitiesCard {

  private readonly store = inject(PlanStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly undo = inject(Undo);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly cities = computed((): readonly City[] => this.store.plan().cities);

  protected readonly participantsLabel = computed((): string => {
    const plan: Plan = this.store.plan();
    const total: Range = rangeOf(plan, 'participants');
    if (total.end === 0) {
      return '0';
    }
    return total.start === total.end ? `${total.start}` : `${total.start}–${total.end}`;
  });

  protected cityName(city: City): string {
    return cityName(city, this.t());
  }

  protected setCityName(city: City, name: string): void {
    this.store.setCityName(city.id, name);
  }

  protected setCityRange(city: City, bound: keyof Range, value: number | null): void {
    if (value !== null) {
      this.store.setCityRange(city.id, bound, value);
    }
  }

  protected addCity(): void {
    this.store.addCity();
  }

  protected removeCity(city: City): void {
    const t = this.t();
    const users: Position[] = this.store.usersOf(city.id);
    if (users.length > 0) {
      const titles: string[] = users.map((position: Position): string => position.title);
      this.snackBar.open(t.cities.inUse(city.name, titles), t.common.ok, {duration: 6000});
      return;
    }
    const removed: Removed<City> | null = this.store.removeCity(city.id);
    if (removed) {
      this.undo.offer(t.common.deleted(city.name), (): void => this.store.restoreCity(removed));
    }
  }
}
