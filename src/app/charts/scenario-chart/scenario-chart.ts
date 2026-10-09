import {Component, Input, OnChanges} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {PlotlyModule} from 'angular-plotly.js';
import {Data} from 'plotly.js-dist-min';
import {City, ContextType} from '../../calculation/position';
import {Dimension, groupKey, sameDimension, ScenarioResults} from '../../calculation/scenarios';
import {formatEuro, ReportChart} from '../../pdf-export';
import {ValueRange} from '../../value-range';
import {ChartStyle, Figure, NO_SCENARIOS, reportChart, withAlpha} from '../chart-style';

const DIMENSION_LABELS: Record<ContextType, string> = {
  [ContextType.PARTICIPANTS]: 'Teilnehmer gesamt',
  [ContextType.LEADERS]: 'Leiter',
  [ContextType.DAYS]: 'Tage',
};

interface DimensionOption {
  label: string;
  dimension: Dimension;
  /** Nimmt mehr als einen Wert an – nur dann lohnt sich die Dimension als Achse. */
  varies: boolean;
}

/** Überschuss gegenübergestellt nach ein oder zwei wählbaren Dimensionen: Säulen, Linie oder 3D-Fläche. */
@Component({
  selector: 'app-scenario-chart',
  imports: [MatCardModule, MatFormFieldModule, MatSelectModule, PlotlyModule],
  templateUrl: './scenario-chart.html',
  styleUrl: './scenario-chart.css',
})
export class ScenarioChart implements OnChanges {

  @Input({required: true})
  results!: ScenarioResults;

  @Input({required: true})
  cities: City[] = [];

  @Input()
  perParticipant: boolean = false;

  /** Wird bei jeder Rechnung erhöht: Städte und Theme ändern sich, ohne dass sich die Eingaben selbst ändern. */
  @Input()
  version: number = 0;

  protected graph: Figure = {data: [], layout: {}, title: '', subtitle: ''};
  protected revision: number = 0;
  protected dimensionOptions: DimensionOption[] = [];
  protected xDimension: Dimension | null = null;
  protected yDimension: Dimension | null = null;
  protected readonly sameDimension = sameDimension;
  /** Für mat-select: Optionen werden bei jeder Rechnung neu erzeugt; „none“ steht für keine Y-Achse. */
  protected readonly compareDimension = (a: Dimension | 'none' | null, b: Dimension | 'none' | null): boolean =>
    typeof a === 'object' && typeof b === 'object' ? sameDimension(a, b) : a === b;

  ngOnChanges(): void {
    this.updateDimensions();
    this.render();
  }

  /** Dasselbe Diagramm in hellen Farben für die PDF. */
  printImage(): Promise<ReportChart | null> {
    return reportChart(this.figure(new ChartStyle(true)), 0.6);
  }

  /** Wechselt eine Achse; die Szenarien werden dafür nur neu gruppiert, nicht neu berechnet. */
  protected setDimension(axis: 'x' | 'y', dimension: Dimension | null): void {
    if (axis === 'x' && dimension !== null) {
      this.xDimension = dimension;
      if (sameDimension(dimension, this.yDimension)) {
        this.yDimension = null;
      }
    } else if (axis === 'y') {
      this.yDimension = dimension;
    }
    this.render();
  }

  private render(): void {
    this.graph = this.figure(new ChartStyle());
    this.revision++;
  }

  private updateDimensions(): void {
    const types: DimensionOption[] = [ContextType.PARTICIPANTS, ContextType.LEADERS, ContextType.DAYS]
      .map((type: ContextType): DimensionOption => ({label: DIMENSION_LABELS[type], dimension: {kind: 'type', type}, varies: false}));
    const cities: DimensionOption[] = this.cities
      .map((city: City): DimensionOption => ({label: `Teilnehmer aus ${city.getName()}`, dimension: {kind: 'city', city}, varies: false}));
    this.dimensionOptions = [...types, ...cities].map((option: DimensionOption): DimensionOption =>
      ({...option, varies: this.results.domain(option.dimension).length > 1}));

    const known = (dimension: Dimension | null): boolean => this.dimensionOptions
      .some((option: DimensionOption): boolean => sameDimension(option.dimension, dimension));
    if (!known(this.xDimension)) {
      // Standard: Teilnehmer und Leiter, sofern sie variieren, sonst die Tage
      const varying: Dimension[] = types
        .slice(0, 2)
        .filter((option: DimensionOption): boolean => this.results.domain(option.dimension).length > 1)
        .map((option: DimensionOption): Dimension => option.dimension);
      this.xDimension = varying[0] ?? types[2].dimension;
      this.yDimension = varying[1] ?? null;
    }
    if (!known(this.yDimension)) {
      this.yDimension = null;
    }
  }

  private dimensionLabel(dimension: Dimension): string {
    return this.dimensionOptions.find((option: DimensionOption): boolean => sameDimension(option.dimension, dimension))?.label ?? '';
  }

  private figure(style: ChartStyle): Figure {
    const valueLabel: string = this.perParticipant ? 'Überschuss pro Teilnehmer' : 'Überschuss';
    if (this.results.isEmpty()) {
      return {data: [], layout: style.base(), title: valueLabel, subtitle: NO_SCENARIOS};
    }
    // Achsen mit nur einem Wert tragen nichts zum Vergleich bei
    const selected: Dimension[] = [this.xDimension, this.yDimension]
      .filter((dimension: Dimension | null): dimension is Dimension => dimension !== null);
    const varying: Dimension[] = selected
      .filter((dimension: Dimension): boolean => this.results.domain(dimension).length > 1);
    const shown: Dimension[] = varying.length > 0 ? varying : selected.slice(0, 1);
    const groups: Map<number, ValueRange> = this.results.aggregate(shown);
    const hasBand: boolean = [...groups.values()].some((group: ValueRange): boolean => group.min !== group.max);
    const title: string = `${valueLabel}: ${shown.map((dimension: Dimension): string => this.dimensionLabel(dimension)).join(' × ')}`;

    if (shown.length === 2) {
      return {
        ...this.surface(style, shown[0], shown[1], groups, valueLabel, hasBand),
        title,
        subtitle: hasBand
          ? 'Zwei Flächen: Minimum und Maximum über alle übrigen Größen; flache Ebene = 0 €'
          : 'Flache Ebene = 0 €',
      };
    }
    const chart = this.results.domain(shown[0]).length > 8
      ? this.line(style, shown[0], groups, valueLabel, hasBand)
      : this.bars(style, shown[0], groups, valueLabel, hasBand);
    return {...chart, title, subtitle: hasBand ? 'Spanne von Minimum bis Maximum über alle übrigen Größen' : ''};
  }

  private surface(style: ChartStyle, x: Dimension, y: Dimension, groups: Map<number, ValueRange>, valueLabel: string,
                  hasBand: boolean): Pick<Figure, 'data' | 'layout'> {
    const xValues: number[] = this.results.domain(x);
    const yValues: number[] = this.results.domain(y);
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
      `${xLabel}: %{x}<br>${yLabel}: %{y}<br>${name}: %{z:,.2f} €<extra></extra>`;
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
      colorbar: {ticksuffix: ' €', outlinewidth: 0, thickness: 16},
      cmin,
      cmax,
    });
    const outline: string = style.color('--mat-sys-outline');

    return {
      data: [
        surface(hasBand ? 'Minimum' : valueLabel, (r: ValueRange): number => r.min, true, 0.9),
        // Das Maximum durchscheinender, damit das Minimum darunter sichtbar bleibt
        ...(hasBand ? [surface('Maximum', (r: ValueRange): number => r.max, false, 0.55)] : []),
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
            ...style.sceneAxis(), ticksuffix: ' €', separatethousands: true, tickformat: ',.0f', title: {text: valueLabel}
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
    const xValues: number[] = this.results.domain(axis);
    const mins: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.min ?? null);
    const maxs: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.max ?? null);
    const primary: string = style.color('--mat-sys-primary');

    return {
      data: hasBand ? [{
        name: 'Minimum',
        x: xValues,
        y: mins,
        type: 'scatter',
        mode: 'lines',
        line: {color: primary, width: 2},
        hovertemplate: 'Minimum: %{y:,.2f} €<extra></extra>'
      }, {
        name: 'Maximum',
        x: xValues,
        y: maxs,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: withAlpha(primary, 0.2),
        line: {color: primary, width: 2, dash: 'dot'},
        hovertemplate: 'Maximum: %{y:,.2f} €<extra></extra>'
      }] : [{
        name: valueLabel,
        x: xValues,
        y: mins,
        type: 'scatter',
        mode: 'lines',
        line: {color: primary, width: 2},
        hovertemplate: '%{y:,.2f} €<extra></extra>'
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
    const xValues: number[] = this.results.domain(axis);
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
      text: ys.map((y: number | null): string => y === null ? '' : formatEuro(y)),
      textposition: 'outside',
      cliponaxis: false,
      hovertemplate: `${name}: %{y:,.2f} €<extra></extra>`
    });

    return {
      data: hasBand ? [
        bar('Minimum', mins, (y: number): string => y < 0 ? error : withAlpha(primary, 0.5)),
        bar('Maximum', maxs, (y: number): string => y < 0 ? error : primary),
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
