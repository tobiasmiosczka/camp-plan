import {City} from './city';
import {Range} from './range';

export enum ContextType {
  PARTICIPANTS,
  LEADERS,
  DAYS
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
}

/** Die Zahlen eines Szenarios, nach denen sich die Faktoren richten. */
export interface Context {
  get(type: ContextType): number;
  /** Teilnehmer aus einer Stadt; 0 für Städte, die nicht einzeln aufgezählt wurden. */
  getParticipantsFrom(city: City): number;
}

/** Ein Szenario mit festen Zahlen. */
export class FixedContext implements Context {
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
