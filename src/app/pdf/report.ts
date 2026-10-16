import {Range} from '../calculation/range';
import {ValueRange} from '../calculation/value-range';

export interface ReportPosition {
  title: string;
  amount: number;
  factors: string;
  sum: ValueRange;
}

export interface ReportCity {
  name: string;
  participants: Range;
}

export interface ReportChart {
  title: string;
  subtitle: string;
  /** JPEG als Data-URL */
  image: string;
  /** Höhe im Verhältnis zur Breite */
  aspect: number;
}

/** Ein Diagramm, das sich für die PDF in hellen Farben rendern lässt. */
export interface ChartSource {
  printImage(): Promise<ReportChart | null>;
}

/** Die beiden Diagramme der PDF, in dieser Reihenfolge. */
export type ChartKind = 'scenario' | 'distribution';

/** Alles, was die PDF zeigt: der Plan, das Ergebnis der Rechnung und beide Diagramme. */
export interface Report {
  /** Projektname; leer, wenn keiner vergeben ist. */
  name: string;
  perParticipant: boolean;
  days: Range;
  leaders: Range;
  participants: Range;
  cities: ReportCity[];
  scenarioCount: number;
  /** Anteil der Szenarien mit Defizit, 0 bis 1. */
  deficitShare: number;
  debit: ReportPosition[];
  credit: ReportPosition[];
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
  chart: ReportChart | null;
  distribution: ReportChart | null;
}
