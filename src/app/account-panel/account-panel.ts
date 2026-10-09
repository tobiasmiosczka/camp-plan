import {Component, effect, inject} from '@angular/core';
import {PlotlyModule} from 'angular-plotly.js';
import {Data, Layout, LayoutAxis} from 'plotly.js-dist-min';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {Position, Range, Context, ContextRange, ContextType, range} from '../calculation/position';
import {PlanStore} from '../plan-store';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {PositionTableComponent} from '../position-table/position-table';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {ValueRange} from '../value-range';

const CONTEXT_LABELS: Record<ContextType, string> = {
  [ContextType.PARTICIPANTS]: 'Teilnehmer',
  [ContextType.LEADERS]: 'Leiter',
  [ContextType.DAYS]: 'Tage',
};

const AXIS_TITLES: Record<ContextType, string> = {
  [ContextType.PARTICIPANTS]: 'Teilnehmerzahl',
  [ContextType.LEADERS]: 'Leiterzahl',
  [ContextType.DAYS]: 'Anzahl der Tage',
};

interface ContextRow {
  type: ContextType;
  label: string;
  icon: string;
  min: number;
}

@Component({
  imports: [
    PlotlyModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    FormsModule,
    PositionTableComponent,
    CurrencyRangePipe
  ],
  selector: 'app-account-panel',
  styleUrl: './account-panel.css',
  templateUrl: './account-panel.html',
})
export class AccountPanel {

  protected readonly contextRows: ContextRow[] = [
    {type: ContextType.DAYS, label: 'Tage', icon: 'calendar_month', min: 1},
    {type: ContextType.PARTICIPANTS, label: 'Teilnehmer', icon: 'groups', min: 1},
    {type: ContextType.LEADERS, label: 'Leiter', icon: 'supervisor_account', min: 0},
  ];

  protected balance: ValueRange = {min: 0, max: 0};
  protected debitTotal: ValueRange = {min: 0, max: 0};
  protected creditTotal: ValueRange = {min: 0, max: 0};

  private readonly store = inject(PlanStore);

  protected contextRange: ContextRange = this.store.plan().contextRange;
  protected debit: Position[] = this.store.plan().debit;
  protected credit: Position[] = this.store.plan().credit;

  protected graph: { data: Data[], layout: Partial<Layout>, revision: number, title: string, subtitle: string } = {
    data: [],
    layout: {},
    revision: 0,
    title: '',
    subtitle: ''
  };

  protected perParticipant: boolean = false;

  public constructor() {
    effect((): void => {
      const plan = this.store.plan();
      this.contextRange = plan.contextRange;
      this.debit = plan.debit;
      this.credit = plan.credit;
      this.compute();
    });
  }

  protected setRange(type: ContextType, bound: 'start' | 'end', value: number | null): void {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    const row = this.contextRows.find((r: ContextRow): boolean => r.type === type);
    const range: Range = this.contextRange.get(type);
    range[bound] = Math.max(row?.min ?? 0, Math.round(value));
    if (range.start > range.end) {
      if (bound === 'start') {
        range.end = range.start;
      } else {
        range.start = range.end;
      }
    }
    this.compute();
  }

  protected compute(): void {
    const permutations: Context[] = this.contextRange.getPermutations();
    const values: Map<Context, number> = new Map<Context, number>();

    let cmin: number = 0;
    let cmax: number = 0;
    let min: number = Infinity;
    let max: number = -Infinity;
    for (let permutation of permutations) {
      const f: number = this.f(permutation);
      const value: number = this.perParticipant ? f / permutation.get(ContextType.PARTICIPANTS) : f;
      values.set(permutation, value);
      cmin = Math.min(cmin, value);
      cmax = Math.max(cmax, value);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    this.balance = {min, max};
    this.debitTotal = this.totalRange(this.debit, permutations);
    this.creditTotal = this.totalRange(this.credit, permutations);

    this.buildGraph(values, cmin, cmax);
    this.graph.revision++;
    this.store.autosave();
  }

  private buildGraph(values: Map<Context, number>, cmin: number, cmax: number): void {
    const varying: ContextType[] = [ContextType.PARTICIPANTS, ContextType.LEADERS]
      .filter((type: ContextType): boolean => range(this.contextRange.get(type)).length > 1);
    const valueLabel: string = this.perParticipant ? 'Überschuss pro Teilnehmer' : 'Überschuss';

    if (varying.length === 2) {
      this.buildSurface(values, valueLabel, cmin, cmax);
    } else if (varying.length === 1) {
      this.buildLine(values, varying[0], valueLabel);
    } else {
      this.buildBars(values, valueLabel);
    }
  }

  private buildSurface(values: Map<Context, number>, valueLabel: string, cmin: number, cmax: number): void {
    const xValues: number[] = range(this.contextRange.get(ContextType.PARTICIPANTS));
    const yValues: number[] = range(this.contextRange.get(ContextType.LEADERS));
    const groups = this.groupBy(values, [ContextType.PARTICIPANTS, ContextType.LEADERS]);
    const z = (pick: (r: ValueRange) => number): number[][] =>
      yValues.map((y: number): number[] => xValues.map((x: number): number => pick(groups.get(`${x}|${y}`)!)));
    const hover = (name: string): string =>
      `Teilnehmer: %{x}<br>Leiter: %{y}<br>${name}: %{z:,.2f} €<extra></extra>`;

    this.graph.title = `${valueLabel} nach Teilnehmern und Leitern`;
    this.graph.subtitle = 'Minimum und Maximum über alle Tagesvarianten; graue Ebene = 0 €';
    this.graph.data = [{
      name: 'Minimum',
      hovertemplate: hover('Minimum'),
      x: xValues,
      y: yValues,
      z: z((r: ValueRange): number => r.min),
      opacity: 0.8,
      type: 'surface',
      colorscale: 'Viridis',
      showscale: true,
      colorbar: {ticksuffix: ' €', outlinewidth: 0},
      cmin: cmin,
      cmax: cmax
    }, {
      name: 'Maximum',
      hovertemplate: hover('Maximum'),
      x: xValues,
      y: yValues,
      z: z((r: ValueRange): number => r.max),
      opacity: 0.8,
      type: 'surface',
      colorscale: 'Viridis',
      showscale: false,
      cmin: cmin,
      cmax: cmax
    }, {
      name: '0',
      x: [xValues[0], xValues[xValues.length - 1]],
      y: [yValues[0], yValues[yValues.length - 1]],
      z: [[0, 0], [0, 0]],
      opacity: 0.6,
      type: 'surface',
      colorscale: [[0, 'grey'], [1, 'grey']],
      hoverinfo: 'none',
      showscale: false,
      cmin: cmin,
      cmax: cmax
    }];
    this.graph.layout = {
      ...this.baseLayout(),
      margin: {l: 0, r: 0, t: 0, b: 0},
      scene: {
        xaxis: {title: {text: 'Teilnehmer'}},
        yaxis: {title: {text: 'Leiter'}},
        zaxis: {ticksuffix: ' €', separatethousands: true, tickformat: '.2f', title: {text: valueLabel}}
      }
    };
  }

  private buildLine(values: Map<Context, number>, axis: ContextType, valueLabel: string): void {
    const xValues: number[] = range(this.contextRange.get(axis));
    const groups = this.groupBy(values, [axis]);
    const mins: number[] = xValues.map((x: number): number => groups.get(`${x}`)!.min);
    const maxs: number[] = xValues.map((x: number): number => groups.get(`${x}`)!.max);
    const hasBand: boolean = mins.some((min: number, i: number): boolean => min !== maxs[i]);
    const primary: string = this.themeColor('--mat-sys-primary');
    const axisLabel: string = CONTEXT_LABELS[axis];
    const fixed: string = this.fixedDescription([ContextType.PARTICIPANTS, ContextType.LEADERS, ContextType.DAYS]
      .filter((type: ContextType): boolean => type !== axis && range(this.contextRange.get(type)).length === 1));

    this.graph.title = `${valueLabel} nach ${AXIS_TITLES[axis]}`;
    this.graph.subtitle = hasBand
      ? `${fixed}; Band = Minimum bis Maximum über ${this.bandDescription(axis)}`
      : fixed;
    this.graph.data = hasBand ? [{
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
      fillcolor: this.withAlpha(primary, 0.2),
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
    }];
    this.graph.layout = {
      ...this.cartesianLayout(valueLabel),
      xaxis: {...this.axisStyle(), title: {text: axisLabel}},
      hovermode: 'x unified',
    };
  }

  private buildBars(values: Map<Context, number>, valueLabel: string): void {
    const days: number[] = range(this.contextRange.get(ContextType.DAYS));
    const groups = this.groupBy(values, [ContextType.DAYS]);
    const ys: number[] = days.map((d: number): number => groups.get(`${d}`)!.min);
    const primary: string = this.themeColor('--mat-sys-primary');
    const error: string = this.themeColor('--mat-sys-error');

    this.graph.title = `${valueLabel} nach ${AXIS_TITLES[ContextType.DAYS]}`;
    this.graph.subtitle = this.fixedDescription([ContextType.PARTICIPANTS, ContextType.LEADERS]);
    this.graph.data = [{
      name: valueLabel,
      x: days.map((d: number): string => d === 1 ? '1 Tag' : `${d} Tage`),
      y: ys,
      type: 'bar',
      marker: {color: ys.map((y: number): string => y < 0 ? error : primary)},
      text: ys.map((y: number): string => this.formatEuro(y)),
      textposition: 'outside',
      cliponaxis: false,
      hovertemplate: '%{x}: %{y:,.2f} €<extra></extra>'
    }];
    this.graph.layout = {
      ...this.cartesianLayout(valueLabel),
      xaxis: {...this.axisStyle(), type: 'category', showgrid: false},
      bargap: 0.5,
      showlegend: false,
    };
  }

  private baseLayout(): Partial<Layout> {
    return {
      autosize: true,
      separators: ',.',
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {family: 'Roboto, sans-serif', color: getComputedStyle(document.body).color},
    };
  }

  private cartesianLayout(valueLabel: string): Partial<Layout> {
    return {
      ...this.baseLayout(),
      margin: {l: 96, r: 24, t: 40, b: 56},
      yaxis: {
        ...this.axisStyle(),
        title: {text: valueLabel},
        ticksuffix: ' €',
        tickformat: ',.0f',
        rangemode: 'tozero',
      },
      legend: {orientation: 'h', x: 0, y: 1.08, traceorder: 'normal'},
      shapes: [{
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 1,
        y0: 0,
        y1: 0,
        line: {color: this.themeColor('--mat-sys-error'), width: 1, dash: 'dash'}
      }],
    };
  }

  private axisStyle(): Partial<LayoutAxis> {
    return {
      gridcolor: this.themeColor('--mat-sys-outline-variant'),
      linecolor: this.themeColor('--mat-sys-outline'),
      zeroline: false,
    };
  }

  /** Beschreibt die festen Achsen, z. B. „8 Teilnehmer, 2 Leiter“. */
  private fixedDescription(types: ContextType[]): string {
    return types
      .map((type: ContextType): string => `${this.contextRange.get(type).start} ${CONTEXT_LABELS[type]}`)
      .join(', ');
  }

  private bandDescription(axis: ContextType): string {
    return [ContextType.PARTICIPANTS, ContextType.LEADERS, ContextType.DAYS]
      .filter((type: ContextType): boolean => type !== axis && range(this.contextRange.get(type)).length > 1)
      .map((type: ContextType): string => CONTEXT_LABELS[type])
      .join(' und ');
  }

  private groupBy(values: Map<Context, number>, types: ContextType[]): Map<string, ValueRange> {
    const groups = new Map<string, ValueRange>();
    values.forEach((value: number, context: Context): void => {
      const key: string = types.map((type: ContextType): number => context.get(type)).join('|');
      const group: ValueRange | undefined = groups.get(key);
      groups.set(key, group
        ? {min: Math.min(group.min, value), max: Math.max(group.max, value)}
        : {min: value, max: value});
    });
    return groups;
  }

  /** Löst eine Material-Farbvariable (ggf. light-dark()) in einen von Plotly lesbaren rgb-Wert auf. */
  private themeColor(variable: string): string {
    const probe: HTMLSpanElement = document.createElement('span');
    probe.style.color = `var(${variable})`;
    document.body.appendChild(probe);
    const color: string = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }

  private withAlpha(rgb: string, alpha: number): string {
    return rgb.replace(/^rgb\((.*)\)$/, `rgba($1, ${alpha})`);
  }

  private formatEuro(value: number): string {
    return value.toLocaleString('de', {style: 'currency', currency: 'EUR'});
  }

  private totalRange(positions: Position[], permutations: Context[]): ValueRange {
    const totals: number[] = permutations.map((context: Context): number => {
      const sum: number = positions.reduce((acc: number, position: Position): number => acc + position.getSum(context), 0);
      return this.perParticipant ? sum / context.get(ContextType.PARTICIPANTS) : sum;
    });
    return {min: Math.min(...totals), max: Math.max(...totals)};
  }

  private f(context: Context): number {
    let sum: number = 0;
    for (const position of this.debit) {
      sum -= position.getSum(context);
    }
    for (const position of this.credit) {
      sum += position.getSum(context);
    }
    return sum;
  }
}
