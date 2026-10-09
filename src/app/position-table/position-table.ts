import {Component, inject, Input, output, viewChild} from '@angular/core';
import {TextFieldModule} from '@angular/cdk/text-field';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTable, MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {
  Context, ContextRange, ContextType, GroupModifier, MODIFIER_OPTIONS, ModifierOption, Position, PositionModifier, Range
} from '../calculation/position';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {ValueRange} from '../value-range';

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
  ],
  templateUrl: './position-table.html',
  styleUrl: './position-table.css',
})
export class PositionTableComponent {

  @Input({required: true})
  positions: Position[] = [];

  @Input({required: true})
  contextRange: ContextRange = new ContextRange(new Map<ContextType, Range>());

  @Input()
  perParticipant: boolean = false;

  readonly changed = output<void>();

  private readonly table = viewChild.required(MatTable);

  private readonly snackBar = inject(MatSnackBar);

  protected readonly modifierOptions: ModifierOption[] = MODIFIER_OPTIONS;

  protected displayedColumns: string[] = [
    'position-name',
    'position-amount',
    'position-modifiers',
    'position-sum',
    'position-actions'
  ];

  protected isGroup(modifier: PositionModifier): modifier is GroupModifier {
    return modifier instanceof GroupModifier;
  }

  protected setTitle(position: Position, title: string): void {
    position.setTitle(title);
    this.changed.emit();
  }

  protected setAmount(position: Position, amount: number | null): void {
    position.setAmount(amount ?? 0);
    this.changed.emit();
  }

  protected setGroupSize(modifier: GroupModifier, groupSize: number | null): void {
    modifier.setGroupSize(groupSize ?? 0);
    this.changed.emit();
  }

  protected addModifier(position: Position, option: ModifierOption): void {
    position.addModifier(option.create());
    this.changed.emit();
  }

  protected removeModifier(position: Position, modifier: PositionModifier): void {
    position.removeModifier(modifier);
    this.changed.emit();
  }

  protected addPosition(): void {
    this.positions.push(new Position('Neue Position', 0));
    this.table().renderRows();
    this.changed.emit();
  }

  protected removePosition(position: Position): void {
    const index = this.positions.indexOf(position);
    if (index >= 0) {
      this.positions.splice(index, 1);
      this.table().renderRows();
      this.changed.emit();
      this.snackBar
        .open(`„${position.getTitle()}“ gelöscht`, 'Rückgängig', {duration: 5000})
        .onAction()
        .subscribe((): void => {
          this.positions.splice(Math.min(index, this.positions.length), 0, position);
          this.table().renderRows();
          this.changed.emit();
        });
    }
  }

  protected getSum(position: Position, perParticipant: boolean): ValueRange {
    const numbers: number[] = this.contextRange
      .getPermutations()
      .map((e: Context): number => this.calculate(position, e, perParticipant));
    return this.toRange(numbers);
  }

  private calculate(position: Position, context: Context, perParticipant: boolean): number {
    return perParticipant ? position.getSum(context) / context.get(ContextType.PARTICIPANTS) : position.getSum(context);
  }

  private toRange(numbers: number[]): ValueRange {
    return {
      min: Math.min(...numbers),
      max: Math.max(...numbers)
    };
  }
}
