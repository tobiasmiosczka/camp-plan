import {ChangeDetectorRef, Component, DestroyRef, effect, inject} from '@angular/core';
import {PlotlyModule} from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';
import {Data, Layout, LayoutAxis} from 'plotly.js-dist-min';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {City, Context, ContextRange, ContextType, PerCityModifier, Position, Range} from '../calculation/position';
import {Dimension, groupKey, sameDimension, ScenarioCache, ScenarioResults} from '../calculation/scenarios';
import {Calculation, Calculator} from '../calculation/calculator';
import {PlanStore} from '../plan-store';
import {ThemeStore} from '../theme-store';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {PositionTableComponent} from '../position-table/position-table';
import {CurrencyRangePipe} from '../currency-range-pipe';
import {ValueRange} from '../value-range';
import {PdfExport, Report, ReportPosition} from '../pdf-export';

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

interface ContextRow {
  type: ContextType;
  label: string;
  icon: string;
  min: number;
}

@Component({
  imports: [
    PlotlyModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
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
    {type: ContextType.LEADERS, label: 'Leiter', icon: 'supervisor_account', min: 0},
  ];

  protected balance: ValueRange = {min: 0, max: 0};
  protected debitTotal: ValueRange = {min: 0, max: 0};
  protected creditTotal: ValueRange = {min: 0, max: 0};
  protected positionSums: Map<Position, ValueRange> = new Map<Position, ValueRange>();
  protected scenarioCount: number = 0;

  private readonly scenarioCache = new ScenarioCache();
  private readonly calculator = new Calculator();
  private results!: ScenarioResults;
  protected dimensionOptions: DimensionOption[] = [];
  protected xDimension: Dimension | null = null;
  protected yDimension: Dimension | null = null;
  protected readonly sameDimension = sameDimension;
  /** Für mat-select: Optionen werden bei jeder Rechnung neu erzeugt; „none“ steht für keine Y-Achse. */
  protected readonly compareDimension = (a: Dimension | 'none' | null, b: Dimension | 'none' | null): boolean =>
    typeof a === 'object' && typeof b === 'object' ? sameDimension(a, b) : a === b;

  private readonly store = inject(PlanStore);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly theme = inject(ThemeStore);
  private readonly snackBar = inject(MatSnackBar);

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
    const pdfExport: PdfExport = inject(PdfExport);
    pdfExport.setSource((): Promise<Report> => this.report());
    inject(DestroyRef).onDestroy((): void => pdfExport.setSource(null));
    effect((): void => {
      const plan = this.store.plan();
      this.contextRange = plan.contextRange;
      this.debit = plan.debit;
      this.credit = plan.credit;
      this.perParticipant = this.store.perParticipant();
      // Das Diagramm liest die Theme-Farben beim Aufbau aus und muss nach einem Wechsel neu gezeichnet werden
      this.theme.dark();
      this.compute();
      // Ohne Zone bemerkt Angular die hier gesetzten Felder sonst nicht, wenn die Änderung von außen kommt (z. B. Header)
      this.changeDetector.markForCheck();
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

  private async report(): Promise<Report> {
    const position = (p: Position): ReportPosition => ({
      title: p.getTitle(),
      amount: p.getAmount(),
      factors: p.getModifiers().map((modifier): string => modifier.getDescription()).join(' × '),
      sum: this.positionSums.get(p) ?? {min: 0, max: 0},
    });
    return {
      perParticipant: this.perParticipant,
      days: this.contextRange.get(ContextType.DAYS),
      leaders: this.contextRange.get(ContextType.LEADERS),
      participants: this.scenarioCount > 0 ? this.contextRange.get(ContextType.PARTICIPANTS) : {start: 0, end: 0, step: 1},
      cities: this.contextRange.getCities().map((city: City) => ({name: city.getName(), participants: city.getParticipants()})),
      scenarioCount: this.scenarioCount,
      debit: this.debit.map(position),
      credit: this.credit.map(position),
      debitTotal: this.debitTotal,
      creditTotal: this.creditTotal,
      balance: this.balance,
      chart: this.graph.data.length === 0 ? null : {
        title: this.graph.title,
        subtitle: this.graph.subtitle,
        image: await PlotlyJS.toImage({data: this.graph.data, layout: this.printLayout()}, {format: 'jpeg', width: 1200, height: 720}),
      },
    };
  }

  /** Das Diagramm für Papier: immer helle Farben, unabhängig vom gewählten Farbmodus. */
  private printLayout(): Partial<Layout> {
    // Ohne Typangabe passt das Objekt sowohl zu 2D- als auch zu 3D-Achsen
    const axis = {gridcolor: '#dde3e3', linecolor: '#6f7979', color: '#191c1c'};
    const layout: Partial<Layout> = this.graph.layout;
    return {
      ...layout,
      font: {...layout.font, color: '#191c1c'},
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: {...layout.xaxis, ...axis},
      yaxis: {...layout.yaxis, ...axis},
      scene: layout.scene && {
        ...layout.scene,
        xaxis: {...layout.scene.xaxis, ...axis},
        yaxis: {...layout.scene.yaxis, ...axis},
        zaxis: {...layout.scene.zaxis, ...axis},
      },
    };
  }

  protected participantsLabel(): string {
    const total: Range = this.contextRange.get(ContextType.PARTICIPANTS);
    if (total.end === 0) {
      return '0';
    }
    return total.start === total.end ? `${total.start}` : `${total.start}–${total.end}`;
  }

  protected setCityName(city: City, name: string): void {
    city.setName(name);
    this.compute();
  }

  protected setCityRange(city: City, bound: 'start' | 'end', value: number | null): void {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    const participants: Range = city.getParticipants();
    participants[bound] = Math.max(0, Math.round(value));
    if (participants.start > participants.end) {
      if (bound === 'start') {
        participants.end = participants.start;
      } else {
        participants.start = participants.end;
      }
    }
    this.compute();
  }

  protected addCity(): void {
    this.contextRange.addCity(new City('Neue Stadt', {start: 0, end: 10, step: 1}));
    this.compute();
  }

  protected removeCity(city: City): void {
    const users: Position[] = [...this.debit, ...this.credit].filter((position: Position): boolean =>
      position.getModifiers().some((modifier): boolean => modifier instanceof PerCityModifier && modifier.getCity() === city));
    if (users.length > 0) {
      const titles: string = users.map((position: Position): string => `„${position.getTitle()}“`).join(', ');
      this.snackBar.open(`${city.getName()} wird noch verwendet in ${titles}.`, 'OK', {duration: 6000});
      return;
    }
    const index: number = this.contextRange.removeCity(city);
    this.compute();
    this.snackBar
      .open(`„${city.getName()}“ gelöscht`, 'Rückgängig', {duration: 5000})
      .onAction()
      .subscribe((): void => {
        this.contextRange.addCity(city, index);
        this.compute();
      });
  }

  /**
   * Rechnet alle Szenarien durch: je Position, je Kontoseite und als Überschuss. Szenarien und Ergebnisse kommen
   * aus dem Cache, solange sich die zugrunde liegenden Zahlen nicht geändert haben.
   */
  protected compute(): void {
    const relevant: City[] = this.referencedCities();
    const permutations: Context[] = this.scenarioCache.getContexts(this.contextRange, relevant);
    this.scenarioCount = permutations.length;
    const calculation: Calculation = this.calculator.calculate(permutations, this.contextRange, this.debit, this.credit,
      this.perParticipant);
    this.balance = calculation.balance;
    this.debitTotal = calculation.debitTotal;
    this.creditTotal = calculation.creditTotal;
    this.positionSums = calculation.positionSums;

    if (this.results?.values !== calculation.values) {
      this.results = new ScenarioResults(permutations, calculation.values, this.contextRange, relevant);
    }
    this.updateDimensions();
    this.renderGraph();
    this.store.autosave();
  }

  /** Wechselt eine Achse des Diagramms; die Szenarien werden dafür nur neu gruppiert, nicht neu berechnet. */
  protected setDimension(axis: 'x' | 'y', dimension: Dimension | null): void {
    if (axis === 'x' && dimension !== null) {
      this.xDimension = dimension;
      if (sameDimension(dimension, this.yDimension)) {
        this.yDimension = null;
      }
    } else if (axis === 'y') {
      this.yDimension = dimension;
    }
    this.renderGraph();
  }

  private updateDimensions(): void {
    const types: DimensionOption[] = [ContextType.PARTICIPANTS, ContextType.LEADERS, ContextType.DAYS]
      .map((type: ContextType): DimensionOption => ({label: DIMENSION_LABELS[type], dimension: {kind: 'type', type}, varies: false}));
    const cities: DimensionOption[] = this.contextRange.getCities()
      .map((city: City): DimensionOption => ({label: `Teilnehmer aus ${city.getName()}`, dimension: {kind: 'city', city}, varies: false}));
    this.dimensionOptions = [...types, ...cities].map((option: DimensionOption): DimensionOption =>
      ({...option, varies: this.results.domain(option.dimension).length > 1}));

    const known = (dimension: Dimension | null): boolean => this.dimensionOptions
      .some((option: DimensionOption): boolean => sameDimension(option.dimension, dimension));
    if (!known(this.xDimension)) {
      // Standard wie bisher: Teilnehmer und Leiter, sofern sie variieren, sonst die Tage
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

  private renderGraph(): void {
    this.buildGraph();
    this.graph.revision++;
  }

  private buildGraph(): void {
    const valueLabel: string = this.perParticipant ? 'Überschuss pro Teilnehmer' : 'Überschuss';

    if (this.results.isEmpty()) {
      this.graph.title = valueLabel;
      this.graph.subtitle = 'Keine Szenarien: Trage bei den Städten Teilnehmer ein.';
      this.graph.data = [];
      this.graph.layout = this.baseLayout();
      return;
    }
    // Achsen mit nur einem Wert tragen nichts zum Vergleich bei
    const selected: Dimension[] = [this.xDimension, this.yDimension]
      .filter((dimension: Dimension | null): dimension is Dimension => dimension !== null);
    const varying: Dimension[] = selected
      .filter((dimension: Dimension): boolean => this.results.domain(dimension).length > 1);
    const shown: Dimension[] = varying.length > 0 ? varying : selected.slice(0, 1);
    const groups: Map<number, ValueRange> = this.results.aggregate(shown);
    const hasBand: boolean = [...groups.values()].some((group: ValueRange): boolean => group.min !== group.max);

    this.graph.title = `${valueLabel}: ${shown.map((dimension: Dimension): string => this.dimensionLabel(dimension)).join(' × ')}`;
    if (shown.length === 2) {
      this.graph.subtitle = hasBand
        ? 'Zwei Flächen: Minimum und Maximum über alle übrigen Größen; flache Ebene = 0 €'
        : 'Flache Ebene = 0 €';
      this.buildSurface(shown[0], shown[1], groups, valueLabel, hasBand);
    } else {
      this.graph.subtitle = hasBand ? 'Spanne von Minimum bis Maximum über alle übrigen Größen' : '';
      if (this.results.domain(shown[0]).length > 8) {
        this.buildLine(shown[0], groups, valueLabel, hasBand);
      } else {
        this.buildBars(shown[0], groups, valueLabel, hasBand);
      }
    }
  }

  private buildSurface(x: Dimension, y: Dimension, groups: Map<number, ValueRange>, valueLabel: string,
                       hasBand: boolean): void {
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
    const colorscale: [number, string][] = this.surfaceColorscale(cmin, cmax);
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
    const outline: string = this.themeColor('--mat-sys-outline');

    this.graph.data = [
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
    ];
    this.graph.layout = {
      ...this.baseLayout(),
      margin: {l: 0, r: 0, t: 0, b: 0},
      scene: {
        // Bei wenigen Werten nur ganze Zahlen beschriften, sonst erscheinen „2,2 Tage“
        xaxis: {...this.sceneAxisStyle(), title: {text: xLabel}, ...(xValues.length <= 10 ? {dtick: 1} : {})},
        yaxis: {...this.sceneAxisStyle(), title: {text: yLabel}, ...(yValues.length <= 10 ? {dtick: 1} : {})},
        zaxis: {
          ...this.sceneAxisStyle(), ticksuffix: ' €', separatethousands: true, tickformat: ',.0f', title: {text: valueLabel}
        },
      }
    };
  }

  /**
   * Farbverlauf aus dem Theme statt einer fremden Skala: Überschüsse von Secondary-Container bis Primary,
   * Defizite von Error-Container bis Error. Der harte Wechsel bei 0 € macht die Grenze sichtbar.
   */
  private surfaceColorscale(cmin: number, cmax: number): [number, string][] {
    const primary: string = this.themeColor('--mat-sys-primary');
    // Der Primary-Container der Cyan-Palette ist im hellen Modus grell; der Secondary-Container ist ruhiger
    const surplusStart: string = this.themeColor('--mat-sys-secondary-container');
    if (cmin >= 0 || cmax <= cmin) {
      return [[0, surplusStart], [1, primary]];
    }
    const error: string = this.themeColor('--mat-sys-error');
    const errorContainer: string = this.themeColor('--mat-sys-error-container');
    if (cmax <= 0) {
      return [[0, error], [1, errorContainer]];
    }
    const zero: number = -cmin / (cmax - cmin);
    return [[0, error], [zero, errorContainer], [Math.min(1, zero + 1e-6), surplusStart], [1, primary]];
  }

  private buildLine(axis: Dimension, groups: Map<number, ValueRange>, valueLabel: string, hasBand: boolean): void {
    const xValues: number[] = this.results.domain(axis);
    const mins: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.min ?? null);
    const maxs: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.max ?? null);
    const primary: string = this.themeColor('--mat-sys-primary');

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
      xaxis: {...this.axisStyle(), title: {text: this.dimensionLabel(axis)}},
      hovermode: 'x unified',
    };
  }

  private buildBars(axis: Dimension, groups: Map<number, ValueRange>, valueLabel: string, hasBand: boolean): void {
    const xValues: number[] = this.results.domain(axis);
    const categories: string[] = xValues.map((x: number): string => `${x}`);
    const mins: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.min ?? null);
    const maxs: (number | null)[] = xValues.map((x: number): number | null => groups.get(x)?.max ?? null);
    const primary: string = this.themeColor('--mat-sys-primary');
    const error: string = this.themeColor('--mat-sys-error');
    const bar = (name: string, ys: (number | null)[], color: (y: number) => string): Data => ({
      name,
      x: categories,
      y: ys,
      type: 'bar',
      marker: {color: ys.map((y: number | null): string => color(y ?? 0))},
      text: ys.map((y: number | null): string => y === null ? '' : this.formatEuro(y)),
      textposition: 'outside',
      cliponaxis: false,
      hovertemplate: `${name}: %{y:,.2f} €<extra></extra>`
    });

    this.graph.data = hasBand ? [
      bar('Minimum', mins, (y: number): string => y < 0 ? error : this.withAlpha(primary, 0.5)),
      bar('Maximum', maxs, (y: number): string => y < 0 ? error : primary),
    ] : [
      bar(valueLabel, mins, (y: number): string => y < 0 ? error : primary),
    ];
    this.graph.layout = {
      ...this.cartesianLayout(valueLabel),
      xaxis: {...this.axisStyle(), type: 'category', showgrid: false, title: {text: this.dimensionLabel(axis)}},
      bargap: 0.4,
      showlegend: hasBand,
    };
  }

  private baseLayout(): Partial<Layout> {
    return {
      autosize: true,
      separators: ',.',
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {family: 'Roboto, sans-serif', color: getComputedStyle(document.body).color},
      hoverlabel: {
        bgcolor: this.themeColor('--mat-sys-surface-container-highest'),
        bordercolor: this.themeColor('--mat-sys-outline-variant'),
        font: {family: 'Roboto, sans-serif', color: this.themeColor('--mat-sys-on-surface')},
      },
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

  private sceneAxisStyle() {
    return {
      gridcolor: this.themeColor('--mat-sys-outline-variant'),
      linecolor: this.themeColor('--mat-sys-outline'),
      zerolinecolor: this.themeColor('--mat-sys-outline'),
      showbackground: false,
    };
  }

  private axisStyle(): Partial<LayoutAxis> {
    return {
      gridcolor: this.themeColor('--mat-sys-outline-variant'),
      linecolor: this.themeColor('--mat-sys-outline'),
      zeroline: false,
    };
  }

  /** Städte, auf die ein Faktor „pro Teilnehmer aus …“ verweist. */
  private referencedCities(): City[] {
    return [...this.debit, ...this.credit]
      .flatMap((position: Position) => position.getModifiers())
      .filter((modifier): modifier is PerCityModifier => modifier instanceof PerCityModifier)
      .map((modifier: PerCityModifier): City => modifier.getCity());
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
}
