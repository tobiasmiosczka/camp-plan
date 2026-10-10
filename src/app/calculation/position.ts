export enum ContextType {
  PARTICIPANTS,
  LEADERS,
  DAYS
}

/** Ganzzahliger Bereich, beide Grenzen eingeschlossen. */
export interface Range {
  start: number;
  end: number;
}

export function range(range: Range): number[] {
  const result: number[] = [];
  for (let v = range.start; v <= range.end; v++) {
    result.push(v);
  }
  return result;
}

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

export class ContextRange {
  private readonly map: Map<ContextType, Range> = new Map<ContextType, Range>();
  private readonly cities: City[];

  /**
   * Die Teilnehmerzahl ergibt sich aus den Städten; ein Eintrag für PARTICIPANTS in der Map wird ignoriert.
   * „Sonstige“ steht immer als letzte Stadt in der Liste und wird bei Bedarf ergänzt.
   */
  public constructor(map: Map<ContextType, Range>, cities: City[] = []) {
    this.map = map;
    const others: City = cities.find((city: City): boolean => city.isOthers()) ?? City.others();
    this.cities = [...cities.filter((city: City): boolean => city !== others), others];
  }

  public get(type: ContextType): Range {
    if (type === ContextType.PARTICIPANTS) {
      // Jede Gesamtzahl dazwischen ist erreichbar; ohne Teilnehmer wird nicht gerechnet
      const start: number = this.cities.reduce((sum: number, city: City): number => sum + city.getParticipants().start, 0);
      const end: number = this.cities.reduce((sum: number, city: City): number => sum + city.getParticipants().end, 0);
      return {start: Math.max(1, start), end};
    }
    return this.map.get(type) || {start: 0, end: 0};
  }

  public getCities(): City[] {
    return this.cities;
  }

  /** Fügt eine Stadt vor „Sonstige“ ein. */
  public addCity(city: City, index: number = this.cities.length - 1): void {
    this.cities.splice(Math.min(index, this.cities.length - 1), 0, city);
  }

  public removeCity(city: City): number {
    const index: number = this.cities.indexOf(city);
    if (index >= 0 && !city.isOthers()) {
      this.cities.splice(index, 1);
    }
    return index;
  }

  /**
   * Alle Kombinationen aus Teilnehmern je Stadt, Leitern und Tagen; Szenarien ohne Teilnehmer entfallen.
   *
   * Nur die Städte in `relevant` werden einzeln aufgezählt. Die übrigen wirken sich nur über die Gesamtzahl aus und
   * werden zu einer Spanne zusammengefasst – das ergibt dieselben Ergebnisse mit weit weniger Szenarien.
   */
  public getPermutations(relevant: City[] = this.cities): Context[] {
    const result: Context[] = [];
    for (const [cities, participants] of this.cityPermutations(relevant)) {
      for (let leaders of range(this.get(ContextType.LEADERS))) {
        for (let days of range(this.get(ContextType.DAYS))) {
          result.push(new Context(participants, leaders, days, cities));
        }
      }
    }
    return result;
  }

  /** Teilnehmer je relevanter Stadt zusammen mit der jeweiligen Gesamtzahl. */
  private cityPermutations(relevant: City[]): [Map<City, number>, number][] {
    let result: [Map<City, number>, number][] = [[new Map<City, number>(), 0]];
    const rest: Range = {start: 0, end: 0};
    for (const city of this.cities) {
      const participants: Range = city.getParticipants();
      if (!relevant.includes(city)) {
        rest.start += participants.start;
        rest.end += participants.end;
        continue;
      }
      result = result.flatMap(([partial, total]: [Map<City, number>, number]): [Map<City, number>, number][] =>
        range(participants).map((count: number): [Map<City, number>, number] =>
          [new Map(partial).set(city, count), total + count]));
    }
    return result
      .flatMap(([cities, total]: [Map<City, number>, number]): [Map<City, number>, number][] =>
        range(rest).map((count: number): [Map<City, number>, number] => [cities, total + count]))
      .filter(([, total]: [Map<City, number>, number]): boolean => total > 0);
  }
}

export class Context {
  /** Werte je ContextType als Array statt Map: Bei vielen Städten entstehen über eine Million Szenarien. */
  private readonly values: number[];
  private readonly cities: Map<City, number>;

  public constructor(participants: number, leaders: number, days: number,
                     cities: Map<City, number> = new Map<City, number>()) {
    // Reihenfolge wie in ContextType
    this.values = [participants, leaders, days];
    this.cities = cities;
  }

  public get(type: ContextType): number {
    return this.values[type];
  }

  public getParticipantsFrom(city: City): number {
    return this.cities.get(city) || 0;
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

class PerNightModifier extends PositionModifier {

  modify(context: Context): number {
    return Math.max(0, context.get(ContextType.DAYS) - 1);
  }

  getDescription(): string {
    return 'pro Nacht';
  }

}

export const PER_NIGHT = new PerNightModifier();

export class PerParticipantGroup extends GroupModifier {

  getUnit(): string {
    return 'Teilnehmer';
  }

  modify(context: Context): number {
    return this.divide(context.get(ContextType.PARTICIPANTS));
  }
}

export class PerCityModifier extends PositionModifier {

  private city: City;

  constructor(city: City) {
    super();
    this.city = city;
  }

  public getCity(): City {
    return this.city;
  }

  public setCity(city: City): void {
    this.city = city;
  }

  modify(context: Context): number {
    return context.getParticipantsFrom(this.city);
  }

  getDescription(): string {
    return 'pro Teilnehmer aus ' + this.city.getName();
  }
}

export interface ModifierOption {
  label: string;
  create: (cities: City[]) => PositionModifier;
}

export const MODIFIER_OPTIONS: ModifierOption[] = [
  {label: 'pro Person', create: () => PER_PERSON},
  {label: 'pro Teilnehmer', create: () => PER_PARTICIPANT},
  {label: 'pro Leiter', create: () => PER_LEADER},
  {label: 'pro Tag', create: () => PER_DAY},
  {label: 'pro Nacht', create: () => PER_NIGHT},
  {label: 'pro X Personen', create: () => new PerGroupModifier(10)},
  {label: 'pro X Teilnehmer', create: () => new PerParticipantGroup(10)},
  {label: 'pro Teilnehmer aus …', create: (cities: City[]) => new PerCityModifier(cities[0])},
];

/** Feste Reihenfolge der Faktoren je Art, wie im Auswahlmenü. */
const MODIFIER_ORDER: Function[] = [
  PerPersonModifier, PerParticipantModifier, PerLeaderModifier, PerDayModifier, PerNightModifier,
  PerGroupModifier, PerParticipantGroup, PerCityModifier,
];

/** Sortiert nach Art, gleiche Arten nach Beschreibung (z. B. Gruppengröße oder Stadt). */
function compareModifiers(a: PositionModifier, b: PositionModifier): number {
  return MODIFIER_ORDER.indexOf(a.constructor) - MODIFIER_ORDER.indexOf(b.constructor)
    || a.getDescription().localeCompare(b.getDescription(), 'de', {numeric: true});
}

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
