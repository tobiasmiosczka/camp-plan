import {Component, computed, DestroyRef, inject, input, linkedSignal} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {PlotlyModule} from 'angular-plotly.js';
import {City} from '../../calculation/city';
import {ContextType} from '../../calculation/context';
import {Dimension, sameDimension} from '../../calculation/dimension';
import {ScenarioResults} from '../../calculation/scenario-results';
import {PdfExport} from '../../pdf/pdf-export';
import {cityName} from '../../i18n/labels';
import {Messages} from '../../i18n/de';
import {LanguageStore} from '../../stores/language-store';
import {ChartSource, ReportChart} from '../../pdf/report';
import {ThemeStore} from '../../stores/theme-store';
import {ChartStyle, Figure, reportChart} from '../chart-style';
import {scenarioFigure} from './scenario-figure';

const DIMENSION_LABELS: Record<ContextType, 'participantsTotal' | 'leaders' | 'days'> = {
  participants: 'participantsTotal',
  leaders: 'leaders',
  days: 'days',
};

/** In der Reihenfolge der Auswahl; die Städte folgen danach. */
const CONTEXT_TYPES: readonly ContextType[] = ['participants', 'leaders', 'days'];

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

  readonly cities = input.required<readonly City[]>();

  readonly perParticipant = input<boolean>(false);

  private readonly theme = inject(ThemeStore);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly dimensionOptions = computed((): DimensionOption[] => {
    const results: ScenarioResults = this.results();
    const t: Messages = this.t();
    const option = (label: string, dimension: Dimension): DimensionOption =>
      ({label, dimension, varies: results.domain(dimension).length > 1});
    return [
      ...CONTEXT_TYPES.map((type: ContextType): DimensionOption =>
        option(t.common[DIMENSION_LABELS[type]], {kind: 'type', type})),
      ...this.cities().map((city: City): DimensionOption =>
        option(t.charts.participantsFrom(cityName(city, t)), {kind: 'city', city: city.id})),
    ];
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
      const varying: Dimension[] = (['participants', 'leaders'] as const)
        .map((type: ContextType): Dimension => ({kind: 'type', type}))
        .filter((dimension: Dimension): boolean => options.some((option: DimensionOption): boolean =>
          option.varies && sameDimension(option.dimension, dimension)));
      return {x: varying[0] ?? {kind: 'type', type: 'days'}, y: varying[1] ?? null};
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

  private figure(style: ChartStyle): Figure {
    const {x, y}: Axes = this.axes();
    return scenarioFigure(style, {
      results: this.results(), x, y, perParticipant: this.perParticipant(),
      label: (dimension: Dimension): string => this.dimensionLabel(dimension),
    });
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
}
