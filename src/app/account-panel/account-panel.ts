import {Component, computed, effect, inject, Signal, untracked} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatSnackBar} from '@angular/material/snack-bar';
import {City} from '../calculation/city';
import {CitiesCard} from '../cities-card/cities-card';
import {LanguageStore} from '../language-store';
import {PdfExport} from '../pdf-export';
import {PlanCalculation} from '../plan-calculation';
import {PlanStore} from '../plan-store';
import {ProjectCard} from '../project-card/project-card';
import {SettingsCard} from '../settings-card/settings-card';
import {SummaryCard} from '../summary-card/summary-card';
import {TAccount} from '../t-account/t-account';
import {ScenarioChart} from '../charts/scenario-chart/scenario-chart';
import {DistributionChart} from '../charts/distribution-chart/distribution-chart';

/**
 * Die Seite: ordnet die Karten im Raster an und lädt die Diagramme erst bei Bedarf. Was die Karten zeigen, holen
 * sie sich selbst aus Store und Rechnung.
 */
@Component({
  imports: [
    MatCardModule,
    NgTemplateOutlet,
    ProjectCard,
    SummaryCard,
    SettingsCard,
    CitiesCard,
    TAccount,
    ScenarioChart,
    DistributionChart,
  ],
  selector: 'app-account-panel',
  styleUrl: './account-panel.css',
  templateUrl: './account-panel.html',
})
export class AccountPanel {

  private readonly store = inject(PlanStore);
  private readonly calculation = inject(PlanCalculation);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly t = inject(LanguageStore).messages;

  /** Lädt die Diagramme auch ohne Scrollen, weil die PDF sie braucht. */
  protected readonly chartsRequested: Signal<boolean> = inject(PdfExport).chartsRequested;

  protected readonly perParticipant = this.store.perParticipant;
  protected readonly cities = computed((): readonly City[] => this.store.plan().cities);

  /** Bis zum ersten Ergebnis null; die Diagramme erscheinen erst, wenn es da ist. */
  protected readonly result = this.calculation.result;
  /** Während einer neuen Rechnung bleiben die Diagramme stehen und werden nur abgedeckt. */
  protected readonly loading = this.calculation.skeleton;

  public constructor() {
    // Eine fehlgeschlagene Rechnung betrifft die ganze Seite, nicht eine einzelne Karte
    effect((): void => {
      const error: Error | undefined = this.calculation.error();
      if (error) {
        untracked((): void => {
          const t = this.t();
          this.snackBar.open(t.summary.calculationFailed(error.message), t.summary.retry)
            .onAction()
            .subscribe((): void => this.calculation.retry());
        });
      }
    });
  }
}
