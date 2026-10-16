import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LanguageStore } from '../language-store';
import { PlanStore } from '../plan-store';
import { useTestPlan } from '../testing/test-plan';
import { TAccount } from './t-account';

describe('TAccount', () => {
  let fixture: ComponentFixture<TAccount>;
  const text = (): string => fixture.nativeElement.textContent.replace(/\s+/g, ' ');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TAccount],
    })
      .compileComponents();
    fixture = TestBed.createComponent(TAccount);
    await fixture.whenStable();
  });

  it('shows both sides with their totals', () => {
    expect(fixture.nativeElement.querySelectorAll('app-position-table').length).toBe(2);
    expect(text()).toContain('Summe Ausgaben');
    expect(text()).toContain('Summe Einnahmen');
    expect(fixture.nativeElement.querySelectorAll('.t-total-value .skeleton').length).toBe(0);
  });

  it('switches to English without reloading', async () => {
    TestBed.inject(LanguageStore).setLanguage('en');
    await fixture.whenStable();

    expect(text()).toContain('Total expenses');
    expect(text()).toContain('Add item');
    // Englische Zahlen: Euro-Zeichen vorn, Punkt als Dezimaltrenner
    expect(fixture.nativeElement.querySelector('.t-total.debit .t-total-value').textContent).toMatch(/€[\d,]+\.\d{2}/);
  });

  it('keeps the same input field while typing, although every change replaces the plan', async () => {
    useTestPlan();
    await fixture.whenStable();
    const field = (): HTMLTextAreaElement => fixture.nativeElement.querySelector('.t-body.debit textarea');
    const before: HTMLTextAreaElement = field();
    before.focus();

    before.value = 'Turnhalle';
    before.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(TestBed.inject(PlanStore).plan().debit[0].title).toBe('Turnhalle');
    expect(field()).toBe(before);
    expect(document.activeElement).toBe(before);
  });
});
