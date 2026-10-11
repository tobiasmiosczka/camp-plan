import { Component, input } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { AccountPanel } from './account-panel';
import { ScenarioChart } from '../charts/scenario-chart/scenario-chart';
import { DistributionChart } from '../charts/distribution-chart/distribution-chart';
import { PlanStore } from '../plan-store';

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

/** Node stellt unter jsdom kein nutzbares localStorage bereit. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('AccountPanel', () => {
  let fixture: ComponentFixture<AccountPanel>;
  const text = (): string => fixture.nativeElement.textContent.replace(/\s+/g, ' ');

  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    registerLocaleData(localeDe);
    TestBed.configureTestingModule({
      imports: [AccountPanel],
      providers: [CurrencyPipe],
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

  afterEach(() => vi.unstubAllGlobals());

  it('shows the result of the example plan', () => {
    expect(text()).toContain('15.498 Szenarien');
    expect(text()).toContain('478,70 € – 3.078,10 €');
    expect(fixture.nativeElement.querySelector('.summary').getAttribute('aria-busy')).toBe('false');
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

  it('calculates again when a number changes', async () => {
    const store = TestBed.inject(PlanStore);

    store.setAmount(store.plan().credit.at(-1)!, 0);
    await fixture.whenStable();

    expect(text()).toContain('-3.521,30 € – -921,90 €');
    expect(text()).toContain('In mindestens einem Szenario entsteht ein Defizit.');
  });
});
