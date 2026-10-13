import {Component, computed, DestroyRef, inject, input, linkedSignal} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {PlotlyModule} from 'angular-plotly.js';
import {Data} from 'plotly.js-dist-min';
import {City, ContextType} from '../../calculation/position';
import {Dimension, groupKey, sameDimension, ScenarioResults} from '../../calculation/scenarios';
import {PdfExport} from '../../pdf-export';
import {cityName} from '../../i18n/labels';
import {Messages} from '../../i18n/de';
import {LanguageStore} from '../../language-store';
import {ChartSource, ReportChart} from '../../report';
import {PlanStore} from '../../plan-store';
import {ThemeStore} from '../../theme-store';
import {ValueRange} from '../../value-range';
import {ChartStyle, Figure, reportChart, withAlpha} from '../chart-style';

const DIMENSION_LABELS: Record<ContextType, 'participantsTotal' | 'leaders' | 'days'> = {
  [ContextType.PARTICIPANTS]: 'participantsTotal',
  [ContextType.LEADERS]: 'leaders',
  [ContextType.DAYS]: 'days',
};

interface DimensionOption {
  label: string;
  dimension: Dimension;
  /** Nimmt mehr als einen Wert an – nur dann lohnt sich die Dimension als Achse. */
  varies: boolean;
}

/** Gewählte Achsen; ohne Y-Achse ein Säulen- oder Liniendiagramm, mit Y-Achse eine 3D-Fläche. */
interface Axes {
  x: Dimension;
  y: Dimension | null;
}

/** Überschuss gegenübergestellt nach ein oder zwei wählbaren Dimensionen: Säulen, Linie oder 3D-Fläche. */
@Component({
  selector: 'app-scenario-chart',
  imports: [MatCardModule, MatFormFieldModule, MatSelectModule, PlotlyModule],
  templateUrl: './scenario-chart.html',
  styleUrl: './scenario-chart.css',
})
export class ScenarioChart implements ChartSource {

  readonly results = input.required<ScenarioResults>();

  readonly cities = input.required<City[]>();

  readonly perParticipant = input<boolean>(false);

  private readonly store = inject(PlanStore);
  private readonly theme = inject(ThemeStore);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly dimensionOptions = computed((): DimensionOption[] => {
    // Städte werden an Ort und Stelle umbenannt; erst dieser Zähler macht das sichtbar
    this.store.labels();
    const results: ScenarioResults = this.results();
    const t: Messages = this.t();
    const types: Dimension[] = [ContextType.PARTICIPANTS, ContextType.LEADERS, ContextType.DAYS]
      .map((type: ContextType): Dimension => ({kind: 'type', type}));
    const cities: Dimension[] = this.cities().map((city: City): Dimension => ({kind: 'city', city}));
    return [...types, ...cities].map((dimension: Dimension): DimensionOption => ({
      label: dimension.kind === 'type'
        ? t.common[DIMENSION_LABELS[dimension.type]]
        : t.charts.participantsFrom(cityName(dimension.city, t)),
      dimension,
      varies: results.domain(dimension).length > 1,
    }));
  });

  /** Bleibt bei einer neuen Rechnung erhalten, solange es die gewählten Dimensionen noch gibt. */
  protected readonly axes = linkedSignal<DimensionOption[], Axes>({
    source: this.dimensionOptions,
    computation: (options: DimensionOption[], previous?: { value: Axes }): Axes => {
      const known = (dimension: Dimension | null): boolean => dimension !== null && options
        .some((option: DimensionOption): boolean => sameDimension(option.dimension, dimension));
      if (previous && known(previous.value.x)) {
        return {x: previous.value.x, y: known(previous.value.y) ? previous.value.y : null};
      }
      // Standard: Teilnehmer und Leiter, sofern sie variieren, sonst die Tage
      const varying: Dimension[] = options
        .slice(0, 2)
        .filter((option: DimensionOption): boolean => option.varies)
        .map((option: DimensionOption): Dimension => option.dimension);
      return {x: varying[0] ?? options[2].dimension, y: varying[1] ?? null};
    },
  });

  protected readonly graph = computed((): Figure => {
    // Die Farben kommen aus dem Theme und werden beim Aufbau ausgelesen
    this.theme.dark();
    return this.figure(new ChartStyle(this.t()));
  });

  protected readonly sameDimension = sameDimension;
  /** Für mat-select: Optionen werden bei jeder Rechnung neu erzeugt; „none“ steht für keine Y-Achse. */
  protected readonly compareDimension = (a: Dimension | 'none' | null, b: Dimension | 'none' | null): boolean =>
    typeof a === 'object' && typeof b === 'object' ? sameDimension(a, b) : a === b;

  constructor() {
    // Für die PDF verfügbar, solange das Diagramm gezeigt wird
    inject(DestroyRef).onDestroy(inject(PdfExport).registerChart('scenario', this));
  }

  /** Dasselbe Diagramm in hellen Farben für die PDF. */
  printImage(): Promise<ReportChart | null> {
    return reportChart(this.figure(new ChartStyle(this.t(), true)), 0.6);
  }

  /** Wechselt eine Achse; die Szenarien werden dafür nur neu gruppiert, nicht neu berechnet. */
  protected setDimension(axis: keyof Axes, dimension: Dimension | null): void {
    this.axes.update(({x, y}: Axes): Axes => {
      if (axis === 'x' && dimension !== null) {
        return {x: dimension, y: sameDimension(dimension, y) ? null : y};
      }
      return axis === 'y' ? {x, y: dimension} : {x, y};
    });
  }

  private dimensionLabel(dimension: Dimension): string {
    return this.dimensionOptions().find((option: DimensionOption): boolean => sameDimension(option.dimension, dimension))?.label ?? '';
  }

  private figure(style: ChartStyle): Figure {
    const t: Messages = style.t;
    const valueLabel: string = t.charts.surplus(this.perParticipant());
    const {x, y}: Axes = this.axes();
    if (this.results().isEmpty()) {
      return {data: [], layout: style.base(), title: valueLabel, subtitle: t.charts.noScenarios};
    }
    // Achsen mit nur einem Wert tragen nichts zum Vergleich bei
    const selected: Dimension[] = [x, y]
      .filter((dimension: Dimension | null): dimension is Dimension => dimension !== null);
    const varying: Dimension[] = selected
      .filter((dimension: Dimension): boolean => this.results().domain(dimension).length > 1);
    const shown: Dimension[] = varying.length > 0 ? varying : selected.slice(0, 1);
    const groups: Map<number, ValueRange> = this.results().aggregate(shown);
    const hasBand: boolean = [...groups.values()].some((group: ValueRange): boolean => group.min !== group.max);
    const title: string = `${valueLabel}: ${shown.map((dimension: Dimension): string => this.dimensionLabel(dimension)).join(' × ')}`;

    if (shown.length === 2) {
      return {
        ...this.surface(style, shown[0], shown[1], groups, valueLabel, hasBand),
        title,
        subtitle: hasBand ? t.charts.surfaceBand : t.charts.surfaceFlat,
      };
    }
    const chart = this.results().domain(shown[0]).length > 8
      ? this.line(style, shown[0], groups, valueLabel, hasBand)
      : this.bars(style, shown[0], groups, valueLabel, hasBand);
    return {...chart, title, subtitle: hasBand ? t.charts.band : ''};
  }

  private surface(style: ChartStyle, x: Dimension, y: Dimension, groups: Map<number, ValueRange>, valueLabel: string,
                  hasBand: boolean): Pick<Figure, 'data' | 'layout'> {
    const xValues: number[] = this.results().domain(x);
    const yValues: number[] = this.results().domain(y);
    const xLabel: string = this.dimensionLabel(x);
    const yLabel: string = this.dimensionLabel(y);
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
    const colorscale: [number, string][] = this.surfaceColorscale(style, cmin, cmax);
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
          x: [xValues[0], xValues[xValues.length - 1]],
          y: [yValues[0], yValues[yValues.length - 1]],
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
  private surfaceColorscale(style: ChartStyle, cmin: number, cmax: number): [number, string][] {
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

  private line(style: ChartStyle, axis: Dimension, groups: Map<number, ValueRange>, valueLabel: string,
               hasBand: boolean): Pick<Figure, 'data' | 'layout'> {
    const xValues: number[] = this.results().domain(axis);
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
        xaxis: {...style.axis(), title: {text: this.dimensionLabel(axis)}},
        hovermode: 'x unified',
      },
    };
  }

  private bars(style: ChartStyle, axis: Dimension, groups: Map<number, ValueRange>, valueLabel: string,
               hasBand: boolean): Pick<Figure, 'data' | 'layout'> {
    const xValues: number[] = this.results().domain(axis);
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
        xaxis: {...style.axis(), type: 'category', showgrid: false, title: {text: this.dimensionLabel(axis)}},
        bargap: 0.4,
        showlegend: hasBand,
      },
    };
  }
}
