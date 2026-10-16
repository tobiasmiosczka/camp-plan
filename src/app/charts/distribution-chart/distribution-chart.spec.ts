import { ComponentFixture, TestBed } from '@angular/core/testing';
import { evaluate } from '../../calculation/engine';
import { testPlan } from '../../testing/test-plan';
import { ScenarioResults } from '../../calculation/scenarios';
import { DistributionChart } from './distribution-chart';

describe('DistributionChart', () => {
  let chart: DistributionChart;
  // Geschützte Signale der Komponente; das Template mit Plotly wird im Test nicht gerendert
  const graph = () => chart['graph']();

  beforeEach(() => {
    TestBed.overrideTemplate(DistributionChart, '');
    const plan = testPlan();
    const result = evaluate(plan, false);
    const fixture: ComponentFixture<DistributionChart> = TestBed.createComponent(DistributionChart);
    fixture.componentRef.setInput('results', new ScenarioResults(result.scenarios, result.values, plan));
    fixture.componentRef.setInput('calculation', result);
    chart = fixture.componentInstance;
  });

  it('summarises the surplus of all scenarios', () => {
    expect(graph().title).toBe('Verteilung der Szenarien: Überschuss');
    // Vor € und % stehen geschützte Leerzeichen
    expect(graph().subtitle).toMatch(/^6 Szenarien · Mittelwert -45,00\s€ · Defizit in 83,3\s% der Szenarien$/);
  });

  it('counts every scenario once across all classes', () => {
    const counts = (graph().data[0] as { y: number[] }).y;

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(6);
  });

  it('switches to expenses without the deficit note', () => {
    chart['metric'].set('debit');

    expect(graph().title).toBe('Verteilung der Szenarien: Ausgaben');
    expect(graph().subtitle).not.toContain('Defizit');
  });
});
