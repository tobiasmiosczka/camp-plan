import {Component, computed, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {City} from '../calculation/city';
import {ContextRange, ContextType} from '../calculation/context';
import {Position} from '../calculation/position';
import {Range} from '../calculation/range';
import {cityName} from '../i18n/labels';
import {LanguageStore} from '../language-store';
import {PlanStore} from '../plan-store';

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
  protected readonly t = inject(LanguageStore).messages;

  protected readonly contextRange = computed((): ContextRange => this.store.plan().contextRange);

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
