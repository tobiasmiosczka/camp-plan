import {Component, computed, DestroyRef, inject, input, signal} from '@angular/core';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {PlotlyModule} from 'angular-plotly.js';
import {EngineResult} from '../../calculation/engine';
import {ScenarioResults} from '../../calculation/scenario-results';
import {PdfExport} from '../../pdf/pdf-export';
import {LanguageStore} from '../../stores/language-store';
import {ChartSource, ReportChart} from '../../pdf/report';
import {ThemeStore} from '../../stores/theme-store';
import {ChartStyle, Figure, reportChart} from '../chart-style';
import {distributionFigure, Metric} from './distribution-figure';

/** Histogramm: wie viele Szenarien welchen Überschuss, welche Ausgaben oder Einnahmen haben. */
@Component({
  selector: 'app-distribution-chart',
  imports: [MatButtonToggleModule, MatCardModule, PlotlyModule],
  templateUrl: './distribution-chart.html',
  styleUrl: './distribution-chart.css',
})
export class DistributionChart implements ChartSource {

  readonly results = input.required<ScenarioResults>();

  readonly calculation = input.required<EngineResult>();

  readonly perParticipant = input<boolean>(false);

  private readonly theme = inject(ThemeStore);
  protected readonly t = inject(LanguageStore).messages;

  /** Umschalten gruppiert nur die vorhandenen Ergebnisse neu, gerechnet wird nicht. */
  protected readonly metric = signal<Metric>('balance');

  protected readonly graph = computed((): Figure => {
    // Die Farben kommen aus dem Theme und werden beim Aufbau ausgelesen
    this.theme.dark();
    return this.figure(new ChartStyle(this.t()));
  });

  constructor() {
    // Für die PDF verfügbar, solange das Diagramm gezeigt wird
    inject(DestroyRef).onDestroy(inject(PdfExport).registerChart('distribution', this));
  }

  /** Dasselbe Diagramm in hellen Farben für die PDF. */
  printImage(): Promise<ReportChart | null> {
    return reportChart(this.figure(new ChartStyle(this.t(), true)), 0.45);
  }

  private figure(style: ChartStyle): Figure {
    return distributionFigure(style, {
      results: this.results(), calculation: this.calculation(), metric: this.metric(),
      perParticipant: this.perParticipant(),
    });
  }
}
