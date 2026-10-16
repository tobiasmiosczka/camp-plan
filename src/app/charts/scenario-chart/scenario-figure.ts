import {Data} from 'plotly.js-dist-min';
import {Dimension, groupKey} from '../../calculation/dimension';
import {ScenarioResults} from '../../calculation/scenario-results';
import {ValueRange} from '../../calculation/value-range';
import {Messages} from '../../i18n/de';
import {ChartStyle, Figure, withAlpha} from '../chart-style';

/** Was das Diagramm zeigt: die Ergebnisse, die gewählten Achsen und wie Dimensionen heißen. */
export interface ScenarioFigureInput {
  results: ScenarioResults;
  x: Dimension;
  y: Dimension | null;
  perParticipant: boolean;
  label: (dimension: Dimension) => string;
}

/** Eine Achse, fertig zum Zeichnen: alle Werte der Dimension und ihre Beschriftung. */
interface Axis {
  values: number[];
  label: string;
}

/**
 * Überschuss nach ein oder zwei Dimensionen: mit zweien eine 3D-Fläche, sonst Säulen oder bei vielen Werten eine Linie.
 * Gezeigt wird je Wertekombination die Spanne über alle übrigen Szenarien.
 */
export function scenarioFigure(style: ChartStyle, {results, x, y, perParticipant, label}: ScenarioFigureInput): Figure {
  const t: Messages = style.t;
  const valueLabel: string = t.charts.surplus(perParticipant);
  if (results.isEmpty()) {
    return {data: [], layout: style.base(), title: valueLabel, subtitle: t.charts.noScenarios};
  }
  // Achsen mit nur einem Wert tragen nichts zum Vergleich bei; variiert keine, bleibt die X-Achse
  const varies = (dimension: Dimension | null): dimension is Dimension =>
    dimension !== null && results.domain(dimension).length > 1;
  const [first = x, second] = [x, y].filter(varies);
  const shown: Dimension[] = second ? [first, second] : [first];
  const groups: Map<number, ValueRange> = results.aggregate(shown);
  const hasBand: boolean = [...groups.values()].some((group: ValueRange): boolean => group.min !== group.max);
  const title: string = `${valueLabel}: ${shown.map(label).join(' × ')}`;
  const axis = (dimension: Dimension): Axis => ({values: results.domain(dimension), label: label(dimension)});

  if (second) {
    return {
      ...surface(style, axis(first), axis(second), groups, valueLabel, hasBand),
      title,
      subtitle: hasBand ? t.charts.surfaceBand : t.charts.surfaceFlat,
    };
  }
  const chart = results.domain(first).length > 8
    ? line(style, axis(first), groups, valueLabel, hasBand)
    : bars(style, axis(first), groups, valueLabel, hasBand);
  return {...chart, title, subtitle: hasBand ? t.charts.band : ''};
}

function surface(style: ChartStyle, x: Axis, y: Axis, groups: Map<number, ValueRange>, valueLabel: string,
                 hasBand: boolean): Pick<Figure, 'data' | 'layout'> {
  const {values: xValues, label: xLabel} = x;
  const {values: yValues, label: yLabel} = y;
  const z = (pick: (r: ValueRange) => number): (number | null)[][] => yValues.map((yValue: number): (number | null)[] =>
    xValues.map((xValue: number): number | null => {
      const group: ValueRange | undefined = groups.get(groupKey([xValue, yValue]));
      return group ? pick(group) : null;
    }));
  const all: ValueRange[] = [...groups.values()];
  const cmin: number = Math.min(0, ...all.map((group: ValueRange): number => group.min));
  const cmax: number = Math.max(0, ...all.map((group: ValueRange): number => group.max));
  const hover = (name: string): string =>
    `${xLabel}: %{x}<br>${yLabel}: %{y}<br>${name}: ${style.euro('%{z:,.2f}')}<extra></extra>`;
  const colorscale: [number, string][] = surfaceColorscale(style, cmin, cmax);
  const surface = (name: string, pick: (r: ValueRange) => number, showscale: boolean, opacity: number): Data => ({
    name,
    hovertemplate: hover(name),
    x: xValues,
    y: yValues,
    z: z(pick),
    opacity,
    type: 'surface',
    colorscale,
    showscale,
    colorbar: {...style.euroTicks(), outlinewidth: 0, thickness: 16},
    cmin,
    cmax,
  });
  const outline: string = style.color('--mat-sys-outline');

  return {
    data: [
      surface(hasBand ? style.t.charts.minimum : valueLabel, (r: ValueRange): number => r.min, true, 0.9),
      // Das Maximum durchscheinender, damit das Minimum darunter sichtbar bleibt
      ...(hasBand ? [surface(style.t.charts.maximum,   (r: ValueRange): number => r.max, false, 0.55)] : []),
      {
        name: '0',
        // Die Werte sind aufsteigend: Die Ebene reicht vom kleinsten bis zum größten
        x: [Math.min(...xValues), Math.max(...xValues)],
        y: [Math.min(...yValues), Math.max(...yValues)],
        z: [[0, 0], [0, 0]],
        opacity: 0.35,
        type: 'surface',
        colorscale: [[0, outline], [1, outline]],
        hoverinfo: 'none',
        showscale: false,
        cmin,
        cmax,
      },
    ],
    layout: {
      ...style.base(),
      margin: {l: 0, r: 0, t: 0, b: 0},
      scene: {
        // Bei wenigen Werten nur ganze Zahlen beschriften, sonst erscheinen „2,2 Tage“
        xaxis: {...style.sceneAxis(), title: {text: xLabel}, ...(xValues.length <= 10 ? {dtick: 1} : {})},
        yaxis: {...style.sceneAxis(), title: {text: yLabel}, ...(yValues.length <= 10 ? {dtick: 1} : {})},
        zaxis: {
          ...style.sceneAxis(), ...style.euroTicks(), separatethousands: true, tickformat: ',.0f', title: {text: valueLabel}
        },
      }
    },
  };
}

/**
 * Farbverlauf aus dem Theme statt einer fremden Skala: Überschüsse von Secondary-Container bis Primary,
 * Defizite von Error-Container bis Error. Der harte Wechsel bei 0 € macht die Grenze sichtbar.
 */
function surfaceColorscale(style: ChartStyle, cmin: number, cmax: number): [number, string][] {
  const primary: string = style.color('--mat-sys-primary');
  // Der Primary-Container der Cyan-Palette ist im hellen Modus grell; der Secondary-Container ist ruhiger
  const surplusStart: string = style.color('--mat-sys-secondary-container');
  if (cmin >= 0 || cmax <= cmin) {
    return [[0, surplusStart], [1, primary]];
  }
  const error: string = style.color('--mat-sys-error');
  const errorContainer: string = style.color('--mat-sys-error-container');
  if (cmax <= 0) {
    return [[0, error], [1, errorContainer]];
  }
  const zero: number = -cmin / (cmax - cmin);
  return [[0, error], [zero, errorContainer], [Math.min(1, zero + 1e-6), surplusStart], [1, primary]];
}

function line(style: ChartStyle, axis: Axis, groups: Map<number, ValueRange>, valueLabel: string,
              hasBand: boolean): Pick<Figure, 'data' | 'layout'> {
  const xValues: number[] = axis.values;
  const mins: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.min ?? null);
  const maxs: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.max ?? null);
  const primary: string = style.color('--mat-sys-primary');

  return {
    data: hasBand ? [{
      name: style.t.charts.minimum,
      x: xValues,
      y: mins,
      type: 'scatter',
      mode: 'lines',
      line: {color: primary, width: 2},
      hovertemplate: `${style.t.charts.minimum}: ${style.euro('%{y:,.2f}')}<extra></extra>`
    }, {
      name: style.t.charts.maximum,
      x: xValues,
      y: maxs,
      type: 'scatter',
      mode: 'lines',
      fill: 'tonexty',
      fillcolor: withAlpha(primary, 0.2),
      line: {color: primary, width: 2, dash: 'dot'},
      hovertemplate: `${style.t.charts.maximum}: ${style.euro('%{y:,.2f}')}<extra></extra>`
    }] : [{
      name: valueLabel,
      x: xValues,
      y: mins,
      type: 'scatter',
      mode: 'lines',
      line: {color: primary, width: 2},
      hovertemplate: `${style.euro('%{y:,.2f}')}<extra></extra>`
    }],
    layout: {
      ...style.cartesian(valueLabel),
      xaxis: {...style.axis(), title: {text: axis.label}},
      hovermode: 'x unified',
    },
  };
}

function bars(style: ChartStyle, axis: Axis, groups: Map<number, ValueRange>, valueLabel: string,
              hasBand: boolean): Pick<Figure, 'data' | 'layout'> {
  const xValues: number[] = axis.values;
  const categories: string[] = xValues.map((x: number): string => `${x}`);
  const mins: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.min ?? null);
  const maxs: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.max ?? null);
  const primary: string = style.color('--mat-sys-primary');
  const error: string = style.color('--mat-sys-error');
  const bar = (name: string, ys: (number | null)[], color: (y: number) => string): Data => ({
    name,
    x: categories,
    y: ys,
    type: 'bar',
    marker: {color: ys.map((y: number | null): string => color(y ?? 0))},
    text: ys.map((y: number | null): string => y === null ? '' : style.formatEuro(y)),
    textposition: 'outside',
    cliponaxis: false,
    hovertemplate: `${name}: ${style.euro('%{y:,.2f}')}<extra></extra>`
  });

  return {
    data: hasBand ? [
      bar(style.t.charts.minimum, mins, (y: number): string => y < 0 ? error : withAlpha(primary, 0.5)),
      bar(style.t.charts.maximum, maxs, (y: number): string => y < 0 ? error : primary),
    ] : [
      bar(valueLabel, mins, (y: number): string => y < 0 ? error : primary),
    ],
    layout: {
      ...style.cartesian(valueLabel),
      xaxis: {...style.axis(), type: 'category', showgrid: false, title: {text: axis.label}},
      bargap: 0.4,
      showlegend: hasBand,
    },
  };
}
