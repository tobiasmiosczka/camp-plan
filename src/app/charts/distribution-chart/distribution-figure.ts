import {EngineResult} from '../../calculation/engine';
import {Histogram, histogram} from '../../calculation/histogram';
import {ScenarioResults} from '../../calculation/scenario-results';
import {formatPercent} from '../../format/format';
import {Messages} from '../../i18n/de';
import {ChartStyle, Figure} from '../chart-style';

export type Metric = 'balance' | 'debit' | 'credit';

const METRIC_LABELS: Record<Metric, 'surplus' | 'debit' | 'credit'> = {balance: 'surplus', debit: 'debit', credit: 'credit'};

/** Was das Histogramm zeigt: welche Größe aus welcher Rechnung. */
export interface DistributionFigureInput {
  results: ScenarioResults;
  calculation: EngineResult;
  metric: Metric;
  perParticipant: boolean;
}

/** Wie viele Szenarien welchen Wert haben, mit Mittelwert und beim Überschuss der 0-€-Grenze. */
export function distributionFigure(style: ChartStyle,
                                   {results, calculation, metric, perParticipant}: DistributionFigureInput): Figure {
  const t: Messages = style.t;
  const label: string = t.common[METRIC_LABELS[metric]] + (perParticipant ? ` ${t.common.perParticipant}` : '');
  const title: string = t.charts.distributionOf(label);
  if (results.isEmpty()) {
    return {data: [], layout: style.base(), title, subtitle: t.charts.noScenarios};
  }
  const series: Record<Metric, ArrayLike<number>> = {
    balance: calculation.values, debit: calculation.debitValues, credit: calculation.creditValues,
  };
  const values: ArrayLike<number> = series[metric];
  const total: number = results.scenarioCount;
  const mean: number = results.mean(values);
  const result: Histogram = histogram(values, results.weights);
  const lower = (i: number): number => result.start + i * result.width;

  const primary: string = style.color('--mat-sys-primary');
  const error: string = style.color('--mat-sys-error');
  const share = (part: number): string => formatPercent(part, t.locale);
  const percent = (count: number): string => share(count / total);
  const facts: string[] = [t.common.scenarios(total), t.charts.mean(style.formatEuro(mean))];
  if (metric === 'balance') {
    facts.push(t.charts.deficitShare(share(results.deficitShare())));
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
        color: result.counts.map((_: number, i: number): string => metric === 'balance' && lower(i) < 0 ? error : primary),
      },
      customdata: result.counts.map((count: number, i: number): string[] =>
        [style.formatEuro(lower(i)), style.formatEuro(lower(i + 1)), percent(count)]),
      hovertemplate: `${t.charts.binRange('%{customdata[0]}', '%{customdata[1]}')}<br>`
        + `${t.charts.scenariosTemplate} (%{customdata[2]})<extra></extra>`,
    }],
    layout: {
      ...style.base(),
      margin: {l: 72, r: 24, t: 24, b: 56},
      bargap: 0.05,
      showlegend: false,
      xaxis: {...style.axis(), title: {text: label}, ...style.euroTicks(), tickformat: ',.0f'},
      yaxis: {...style.axis(), title: {text: t.charts.scenarioCount}, tickformat: ',.0f', rangemode: 'tozero'},
      // Gestrichelt der Mittelwert, gepunktet die 0-€-Grenze beim Überschuss
      shapes: [
        line(mean, style.color('--mat-sys-on-surface-variant'), 'dash'),
        ...(metric === 'balance' ? [line(0, error, 'dot')] : []),
      ],
      annotations: [{
        x: mean, y: 1, yref: 'paper', yanchor: 'bottom', showarrow: false,
        text: t.charts.mean(style.formatEuro(mean)), font: {size: 11},
      }],
    },
  };
}
