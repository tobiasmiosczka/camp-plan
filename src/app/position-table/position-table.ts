import {Component, computed, inject, input} from '@angular/core';
import {TextFieldModule} from '@angular/cdk/text-field';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {City} from '../calculation/city';
import {
  CityModifier, createModifier, GroupModifier, isGroupKind, Modifier, MODIFIER_KINDS, ModifierKind
} from '../calculation/modifiers';
import {Position} from '../calculation/position';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {EuroInputDirective} from '../euro-input';
import {cityName, describeModifier} from '../i18n/labels';
import {LanguageStore} from '../language-store';
import {Side} from '../calculation/plan';
import {PlanStore, Removed} from '../plan-store';
import {Undo} from '../undo';
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
  readonly positions = input.required<readonly Position[]>();

  /** Spanne je Positions-ID über alle Szenarien, vom Konto vorberechnet. */
  readonly sums = input.required<Map<string, ValueRange>>();

  readonly cities = input.required<readonly City[]>();

  readonly perParticipant = input<boolean>(false);

  /** Statt veralteter Summen ein Skelett, solange gerechnet wird. */
  readonly loading = input<boolean>(false);

  private readonly store = inject(PlanStore);
  private readonly undo = inject(Undo);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly sumLabel = computed((): string =>
    this.perParticipant() ? this.t().common.perParticipant : this.t().positions.sum);

  /** Zeilen über die ID wiederfinden: Eine geänderte Position bleibt dieselbe Zeile, Eingabefelder behalten den Fokus. */
  protected readonly trackById = (_: number, position: Position): string => position.id;

  protected readonly modifierKinds: readonly ModifierKind[] = MODIFIER_KINDS;

  protected displayedColumns: string[] = [
    'position-name',
    'position-amount',
    'position-modifiers',
    'position-sum',
    'position-actions'
  ];

  protected describe(modifier: Modifier): string {
    return describeModifier(modifier, this.cities(), this.t());
  }

  protected isGroup(modifier: Modifier): modifier is GroupModifier {
    return isGroupKind(modifier.kind);
  }

  protected isCity(modifier: Modifier): modifier is CityModifier {
    return modifier.kind === 'city';
  }

  protected cityName(city: City): string {
    return cityName(city, this.t());
  }

  protected setCity(position: Position, index: number, city: string): void {
    this.store.setCity(position.id, index, city);
  }

  protected setTitle(position: Position, title: string): void {
    this.store.setTitle(position.id, title);
  }

  protected setAmount(position: Position, amount: number | null): void {
    this.store.setAmount(position.id, amount);
  }

  protected setGroupSize(position: Position, index: number, groupSize: number | null): void {
    this.store.setGroupSize(position.id, index, groupSize);
  }

  protected addModifier(position: Position, kind: ModifierKind): void {
    this.store.addModifier(position.id, createModifier(kind, this.cities()));
  }

  protected removeModifier(position: Position, index: number): void {
    this.store.removeModifier(position.id, index);
  }

  protected addPosition(): void {
    this.store.addPosition(this.side());
  }

  protected removePosition(position: Position): void {
    const side: Side = this.side();
    const removed: Removed<Position> | null = this.store.removePosition(side, position.id);
    if (removed) {
      this.undo.offer(this.t().common.deleted(position.title), (): void => this.store.restorePosition(side, removed));
    }
  }

  protected getSum(position: Position): ValueRange {
    return this.sums().get(position.id) ?? EMPTY_VALUE_RANGE;
  }
}
