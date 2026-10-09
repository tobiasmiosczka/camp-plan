export enum ContextType {
  PARTICIPANTS,
  LEADERS,
  DAYS
}

export interface Range {
  start: number;
  end: number;
  step: number;
}

export function range(range: Range): number[] {
  const result: number[] = [];
  for (let v = range.start; v <= range.end; v += range.step) {
    result.push(v);
  }
  return result;
}

export class ContextRange {
  private readonly map: Map<ContextType, Range> = new Map<ContextType, Range>();

  public constructor(map: Map<ContextType, Range>) {
    this.map = map;
  }

  public get(type: ContextType): Range {
    return this.map.get(type) || {start: 0, end: 0, step: 0};
  }

  public getPermutations(): Context[] {
    const result: Context[] = [];
    for (let participants of range(this.get(ContextType.PARTICIPANTS))) {
      for (let leaders of range(this.get(ContextType.LEADERS))) {
        for (let days of range(this.get(ContextType.DAYS))) {
          const map = new Map<ContextType, number>();
          map.set(ContextType.PARTICIPANTS, participants);
          map.set(ContextType.LEADERS, leaders);
          map.set(ContextType.DAYS, days);
          result.push(new Context(map));
        }
      }
    }
    return result;
  }
}

export class Context {
  private readonly map: Map<ContextType, number> = new Map<ContextType, number>();

  public constructor(map: Map<ContextType, number>) {
    this.map = map;
  }

  public get(type: ContextType): number {
    return this.map.get(type) || 0;
  }
}

export abstract class PositionModifier {

  public abstract modify(context: Context): number;
  public abstract getDescription(): string;
}

export abstract class GroupModifier extends PositionModifier {

  private groupSize: number;

  constructor(groupSize: number) {
    super();
    this.groupSize = groupSize;
  }

  public getGroupSize(): number {
    return this.groupSize;
  }

  public setGroupSize(groupSize: number): void {
    this.groupSize = groupSize;
  }

  public abstract getUnit(): string;

  getDescription(): string {
    return 'pro ' + this.groupSize + ' ' + this.getUnit();
  }

  protected divide(count: number): number {
    return this.groupSize > 0 ? Math.ceil(count / this.groupSize) : 0;
  }
}

class PerPersonModifier extends PositionModifier {

  getDescription(): string {
    return 'pro Person';
  }

  modify(context: Context): number {
    const participants = context.get(ContextType.PARTICIPANTS) || 0;
    const leaders = context.get(ContextType.LEADERS) || 0;
    return participants + leaders
  }

}

export const PER_PERSON = new PerPersonModifier();

export class PerGroupModifier extends GroupModifier {

  getUnit(): string {
    return 'Personen';
  }

  modify(context: Context): number {
    const participants = context.get(ContextType.PARTICIPANTS);
    const leaders = context.get(ContextType.LEADERS);
    return this.divide(participants + leaders);
  }
}

class PerParticipantModifier extends PositionModifier {

  getDescription(): string {
    return 'pro Teilnehmer';
  }

  modify(context: Context): number {
    return context.get(ContextType.PARTICIPANTS);
  }

}

export const PER_PARTICIPANT = new PerParticipantModifier();

class PerLeaderModifier extends PositionModifier {

  modify(context: Context): number {
    return context.get(ContextType.LEADERS);
  }

  getDescription(): string {
    return 'pro Leiter';
  }
}

export const PER_LEADER = new PerLeaderModifier();

class PerDayModifier extends PositionModifier {

  modify(context: Context): number {
    return context.get(ContextType.DAYS);
  }

  getDescription(): string {
    return 'pro Tag';
  }

}

export const PER_DAY = new PerDayModifier();

export class PerParticipantGroup extends GroupModifier {

  getUnit(): string {
    return 'Teilnehmer';
  }

  modify(context: Context): number {
    return this.divide(context.get(ContextType.PARTICIPANTS));
  }
}

export interface ModifierOption {
  label: string;
  create: () => PositionModifier;
}

export const MODIFIER_OPTIONS: ModifierOption[] = [
  {label: 'pro Person', create: () => PER_PERSON},
  {label: 'pro Teilnehmer', create: () => PER_PARTICIPANT},
  {label: 'pro Leiter', create: () => PER_LEADER},
  {label: 'pro Tag', create: () => PER_DAY},
  {label: 'pro X Personen', create: () => new PerGroupModifier(10)},
  {label: 'pro X Teilnehmer', create: () => new PerParticipantGroup(10)},
];

export class Position {

  private title: string;
  private amount: number;
  private readonly positionModifier: Array<PositionModifier>;

  public constructor(title: string, amount: number, positionModifiers: Array<PositionModifier> = []) {
    this.title = title;
    this.amount = amount;
    this.positionModifier = positionModifiers;
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
