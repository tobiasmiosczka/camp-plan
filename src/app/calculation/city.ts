import {Range} from './range';

/** Eine Stadt, aus der Teilnehmende kommen, mit geschätzter Teilnehmerzahl. */
export class City {

  public static readonly OTHERS_NAME = 'Sonstige';

  private name: string;
  private readonly participants: Range;
  private readonly others: boolean;

  public constructor(name: string, participants: Range, others: boolean = false) {
    this.name = name;
    this.participants = participants;
    this.others = others;
  }

  /** Sammelposten für alle Teilnehmenden ohne eigene Stadt; gibt es in jedem Plan genau einmal. */
  public static others(participants: Range = {start: 0, end: 0}): City {
    return new City(City.OTHERS_NAME, participants, true);
  }

  public isOthers(): boolean {
    return this.others;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    if (!this.others) {
      this.name = name;
    }
  }

  public getParticipants(): Range {
    return this.participants;
  }
}
