import {Context} from './context';
import {compareModifiers, PositionModifier} from './modifiers';

export class Position {

  private title: string;
  private amount: number;
  private readonly positionModifier: Array<PositionModifier>;

  public constructor(title: string, amount: number, positionModifiers: Array<PositionModifier> = []) {
    this.title = title;
    this.amount = amount;
    this.positionModifier = [...positionModifiers].sort(compareModifiers);
  }

  public getTitle(): string {
    return this.title;
  }

  public setTitle(title: string): void {
    this.title = title;
  }

  public getAmount(): number {
    return this.amount;
  }

  public setAmount(amount: number): void {
    this.amount = amount;
  }

  public getSum(context: Context): number {
    let amount = this.amount;
    for (const modifier of this.positionModifier) {
      amount = modifier.modify(context) * amount;
    }
    return amount;
  }

  public getModifiers(): PositionModifier[] {
    return this.positionModifier;
  }

  public addModifier(modifier: PositionModifier): void {
    this.positionModifier.push(modifier);
    this.positionModifier.sort(compareModifiers);
  }

  public removeModifier(modifier: PositionModifier): void {
    const index = this.positionModifier.indexOf(modifier);
    if (index >= 0) {
      this.positionModifier.splice(index, 1);
    }
  }

  public per(modifiers: PositionModifier[]): Position {
    return new Position(this.title, this.amount, [...this.positionModifier, ...modifiers]);
  }
}
