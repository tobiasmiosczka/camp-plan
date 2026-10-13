import { Component, input } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { AccountPanel } from './account-panel';
import { ScenarioChart } from '../charts/scenario-chart/scenario-chart';
import { DistributionChart } from '../charts/distribution-chart/distribution-chart';

// Plotly braucht Canvas und WebGL, die jsdom nicht hat; die Diagramme werden hier nur als Platzhalter eingesetzt
@Component({selector: 'app-scenario-chart', template: ''})
class FakeScenarioChart {
  readonly results = input();
  readonly cities = input();
  readonly perParticipant = input();
}

@Component({selector: 'app-distribution-chart', template: ''})
class FakeDistributionChart {
  readonly results = input();
  readonly calculation = input();
  readonly perParticipant = input();
}

describe('AccountPanel', () => {
  let fixture: ComponentFixture<AccountPanel>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [AccountPanel],
      // jsdom kennt keinen IntersectionObserver; die Diagramme werden im Test von Hand geladen
      deferBlockBehavior: DeferBlockBehavior.Manual,
    });
    TestBed.overrideComponent(AccountPanel, {
      remove: {imports: [ScenarioChart, DistributionChart]},
      add: {imports: [FakeScenarioChart, FakeDistributionChart]},
    });
    // Die Diagramme hinter @defer werden erst hier aufgelöst
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(AccountPanel);
    await fixture.whenStable();
  });

  it('places every card on the page', () => {
    const cards = [...fixture.nativeElement.querySelector('.page').children].map((card: Element) => card.localName);

    expect(cards).toEqual([
      'app-project-card', 'app-summary-card', 'app-settings-card', 'app-cities-card', 'app-t-account', 'div',
    ]);
  });

  it('shows skeletons until the charts are loaded', async () => {
    const charts = (): number => fixture.nativeElement.querySelectorAll('app-scenario-chart, app-distribution-chart').length;
    expect(charts()).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.charts .chart-skeleton').length).toBe(2);

    const [deferBlock] = await fixture.getDeferBlocks();
    await deferBlock.render(DeferBlockState.Complete);

    expect(charts()).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.charts .chart-skeleton').length).toBe(0);
  });
});
