import {Component, computed, inject, input} from '@angular/core';
import {TextFieldModule} from '@angular/cdk/text-field';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {City} from '../calculation/city';
import {
  createModifier, GroupModifier, MODIFIER_KINDS, ModifierKind, PerCityModifier, PositionModifier
} from '../calculation/modifiers';
import {Position} from '../calculation/position';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {EuroInputDirective} from '../euro-input';
import {cityName, describeModifier} from '../i18n/labels';
import {LanguageStore} from '../language-store';
import {PlanStore, Side} from '../plan-store';
import {EMPTY_VALUE_RANGE, ValueRange} from '../value-range';

@Component({
  selector: 'app-position-table',
  imports: [
    MatTableModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    TextFieldModule,
    CurrencyRangePipe,
    EuroInputDirective,
  ],
  templateUrl: './position-table.html',
  styleUrl: './position-table.css',
})
export class PositionTableComponent {

  readonly side = input.required<Side>();

  /** Die Liste des Plans; geändert wird sie nur über den {@link PlanStore}. */
  readonly positions = input.required<Position[]>();

  /** Spanne je Position über alle Szenarien, vom Konto vorberechnet. */
  readonly sums = input.required<Map<Position, ValueRange>>();

  readonly cities = input.required<City[]>();

  readonly perParticipant = input<boolean>(false);

  /** Statt veralteter Summen ein Skelett, solange gerechnet wird. */
  readonly loading = input<boolean>(false);

  private readonly store = inject(PlanStore);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly sumLabel = computed((): string =>
    this.perParticipant() ? this.t().common.perParticipant : this.t().positions.sum);

  /**
   * Eine neue Liste bei jeder Änderung: Die Tabelle zeichnet ihre Zeilen nur neu, wenn sich die Liste selbst ändert.
   * Die Positionen bleiben dieselben Objekte, Eingabefelder behalten also den Fokus.
   */
  protected readonly rows = computed((): Position[] => {
    this.store.revision();
    return [...this.positions()];
  });

  protected readonly modifierKinds: readonly ModifierKind[] = MODIFIER_KINDS;

  protected displayedColumns: string[] = [
    'position-name',
    'position-amount',
    'position-modifiers',
    'position-sum',
    'position-actions'
  ];

  protected describe(modifier: PositionModifier): string {
    return describeModifier(modifier, this.t());
  }

  protected cityName(city: City): string {
    return cityName(city, this.t());
  }

  protected isGroup(modifier: PositionModifier): modifier is GroupModifier {
    return modifier instanceof GroupModifier;
  }

  protected isCity(modifier: PositionModifier): modifier is PerCityModifier {
    return modifier instanceof PerCityModifier;
  }

  protected setCity(modifier: PerCityModifier, city: City): void {
    this.store.setCity(modifier, city);
  }

  protected setTitle(position: Position, title: string): void {
    this.store.setTitle(position, title);
  }

  protected setAmount(position: Position, amount: number | null): void {
    this.store.setAmount(position, amount);
  }

  protected setGroupSize(modifier: GroupModifier, groupSize: number | null): void {
    this.store.setGroupSize(modifier, groupSize);
  }

  protected addModifier(position: Position, kind: ModifierKind): void {
    this.store.addModifier(position, createModifier(kind, this.cities()));
  }

  protected removeModifier(position: Position, modifier: PositionModifier): void {
    this.store.removeModifier(position, modifier);
  }

  protected addPosition(): void {
    this.store.addPosition(this.side());
  }

  protected removePosition(position: Position): void {
    const side: Side = this.side();
    const index: number = this.store.removePosition(side, position);
    if (index >= 0) {
      this.snackBar
        .open(this.t().common.deleted(position.getTitle()), this.t().common.undo, {duration: 5000})
        .onAction()
        .subscribe((): void => this.store.restorePosition(side, position, index));
    }
  }

  protected getSum(position: Position): ValueRange {
    return this.sums().get(position) ?? EMPTY_VALUE_RANGE;
  }
}
