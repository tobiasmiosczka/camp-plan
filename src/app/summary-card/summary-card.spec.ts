import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlanStore } from '../plan-store';
import { useTestPlan } from '../testing/test-plan';
import { SummaryCard } from './summary-card';

describe('SummaryCard', () => {
  let fixture: ComponentFixture<SummaryCard>;
  const text = (): string => fixture.nativeElement.textContent.replace(/\s+/g, ' ');
  const card = (): HTMLElement => fixture.nativeElement.querySelector('.summary');

  beforeEach(async () => {
    useTestPlan();
    fixture = TestBed.createComponent(SummaryCard);
    await fixture.whenStable();
  });

  it('shows the surplus over all scenarios', () => {
    expect(text()).toContain('Überschuss gesamt');
    expect(text()).toContain('-100,00 € – 10,00 €');
    expect(text()).toContain('6 Szenarien');
    expect(card().getAttribute('aria-busy')).toBe('false');
  });

  it('warns when any scenario runs a deficit', () => {
    expect(card().classList).toContain('negative');
    expect(fixture.nativeElement.querySelector('.summary-hint').classList).not.toContain('reserved');
  });

  it('calculates again when a number changes', async () => {
    const store = TestBed.inject(PlanStore);

    // Ohne Halle: Überschuss = 45 · A + 40 − 20 · L, also 0 € bis 110 € und kein Defizit mehr
    store.setAmount(store.plan().debit[0].id, 0);
    await fixture.whenStable();

    expect(text()).toContain('0,00 € – 110,00 €');
    expect(card().classList).not.toContain('negative');
    expect(fixture.nativeElement.querySelector('.summary-hint').classList).toContain('reserved');
  });
});
