import {Component, Input, OnChanges} from '@angular/core';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {PlotlyModule} from 'angular-plotly.js';
import {Calculation} from '../../calculation/calculator';
import {Histogram, histogram, ScenarioResults} from '../../calculation/scenarios';
import {formatEuro, ReportChart} from '../../pdf-export';
import {ChartStyle, Figure, NO_SCENARIOS, reportChart} from '../chart-style';

type Metric = 'balance' | 'debit' | 'credit';

const METRIC_LABELS: Record<Metric, string> = {balance: 'Überschuss', debit: 'Ausgaben', credit: 'Einnahmen'};

/** Histogramm: wie viele Szenarien welchen Überschuss, welche Ausgaben oder Einnahmen haben. */
@Component({
  selector: 'app-distribution-chart',
  imports: [MatButtonToggleModule, MatCardModule, PlotlyModule],
  templateUrl: './distribution-chart.html',
  styleUrl: './distribution-chart.css',
})
export class DistributionChart implements OnChanges {

  @Input({required: true})
  results!: ScenarioResults;

  @Input({required: true})
  calculation!: Calculation;

  @Input()
  perParticipant: boolean = false;

  /** Wird bei jeder Rechnung erhöht, damit auch ein Theme-Wechsel neu zeichnet. */
  @Input()
  version: number = 0;

  protected metric: Metric = 'balance';
  protected graph: Figure = {data: [], layout: {}, title: '', subtitle: ''};
  protected revision: number = 0;

  ngOnChanges(): void {
    this.render();
  }

  /** Dasselbe Diagramm in hellen Farben für die PDF. */
  printImage(): Promise<ReportChart | null> {
    return reportChart(this.figure(new ChartStyle(true)), 0.45);
  }

  /** Nutzt die gespeicherten Ergebnisse, ohne neu zu rechnen. */
  protected setMetric(metric: Metric): void {
    this.metric = metric;
    this.render();
  }

  private render(): void {
    this.graph = this.figure(new ChartStyle());
    this.revision++;
  }

  private figure(style: ChartStyle): Figure {
    const label: string = METRIC_LABELS[this.metric] + (this.perParticipant ? ' pro Teilnehmer' : '');
    const title: string = `Verteilung der Szenarien: ${label}`;
    if (this.results.isEmpty()) {
      return {data: [], layout: style.base(), title, subtitle: NO_SCENARIOS};
    }
    const values: ArrayLike<number> = this.metric === 'balance' ? this.calculation.values
      : this.metric === 'debit' ? this.calculation.debitValues : this.calculation.creditValues;
    const weights: Float64Array = this.results.weights;
    const total: number = this.results.scenarioCount;
    let weightedSum: number = 0;
    let deficit: number = 0;
    for (let i = 0; i < values.length; i++) {
      weightedSum += values[i] * weights[i];
      deficit += values[i] < 0 ? weights[i] : 0;
    }
    const mean: number = weightedSum / total;
    const result: Histogram = histogram(values, weights);
    const lower = (i: number): number => result.start + i * result.width;

    const primary: string = style.color('--mat-sys-primary');
    const error: string = style.color('--mat-sys-error');
    const percent = (count: number): string =>
      (count / total).toLocaleString('de', {style: 'percent', maximumFractionDigits: 1});
    const facts: string[] = [`${total.toLocaleString('de')} Szenarien`, `Mittelwert ${formatEuro(mean)}`];
    if (this.metric === 'balance') {
      facts.push(`Defizit in ${percent(deficit)} der Szenarien`);
    }
    const line = (x: number, color: string, dash: 'dash' | 'dot') => ({
      type: 'line' as const, yref: 'paper' as const, x0: x, x1: x, y0: 0, y1: 1, line: {color, width: 1.5, dash},
    });

    return {
      title,
      subtitle: facts.join(' · '),
      data: [{
        name: label,
        type: 'bar',
        x: result.counts.map((_: number, i: number): number => lower(i) + result.width / 2),
        y: result.counts,
        width: result.counts.map((): number => result.width),
        marker: {
          color: result.counts.map((_: number, i: number): string => this.metric === 'balance' && lower(i) < 0 ? error : primary),
        },
        customdata: result.counts.map((count: number, i: number): string[] =>
          [formatEuro(lower(i)), formatEuro(lower(i + 1)), percent(count)]),
        hovertemplate: '%{customdata[0]} bis %{customdata[1]}<br>%{y:,.0f} Szenarien (%{customdata[2]})<extra></extra>',
      }],
      layout: {
        ...style.base(),
        margin: {l: 72, r: 24, t: 24, b: 56},
        bargap: 0.05,
        showlegend: false,
        xaxis: {...style.axis(), title: {text: label}, ticksuffix: ' €', tickformat: ',.0f'},
        yaxis: {...style.axis(), title: {text: 'Anzahl Szenarien'}, tickformat: ',.0f', rangemode: 'tozero'},
        // Gestrichelt der Mittelwert, gepunktet die 0-€-Grenze beim Überschuss
        shapes: [
          line(mean, style.color('--mat-sys-on-surface-variant'), 'dash'),
          ...(this.metric === 'balance' ? [line(0, error, 'dot')] : []),
        ],
        annotations: [{
          x: mean, y: 1, yref: 'paper', yanchor: 'bottom', showarrow: false,
          text: `Mittelwert ${formatEuro(mean)}`, font: {size: 11},
        }],
      },
    };
  }
}
