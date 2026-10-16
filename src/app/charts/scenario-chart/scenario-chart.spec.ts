import { ComponentFixture, TestBed } from '@angular/core/testing';
import { evaluate } from '../../calculation/engine';
import { defaultPlan, Plan, planToData } from '../../calculation/plan';
import {ContextType} from '../../calculation/context';
import { ScenarioResults } from '../../calculation/scenarios';
import { PlanStore } from '../../plan-store';
import { ScenarioChart } from './scenario-chart';

describe('ScenarioChart', () => {
  let fixture: ComponentFixture<ScenarioChart>;
  let chart: ScenarioChart;
  let plan: Plan;
  // Geschützte Signale der Komponente; das Template mit Plotly wird im Test nicht gerendert
  const graph = () => chart['graph']();
  const axes = () => chart['axes']();

  beforeEach(() => {
    TestBed.overrideTemplate(ScenarioChart, '');
    plan = defaultPlan();
    const result = evaluate(planToData(plan), false);
    fixture = TestBed.createComponent(ScenarioChart);
    fixture.componentRef.setInput('results', new ScenarioResults(result.scenarios, result.values, plan.contextRange));
    fixture.componentRef.setInput('cities', plan.contextRange.getCities());
    chart = fixture.componentInstance;
  });

  it('compares participants and leaders on a surface by default', () => {
    expect(axes().x).toEqual({kind: 'type', type: ContextType.PARTICIPANTS});
    expect(axes().y).toEqual({kind: 'type', type: ContextType.LEADERS});
    expect(graph().title).toBe('Überschuss: Teilnehmer gesamt × Leiter');
    expect(graph().data.map(trace => trace.type)).toEqual(['surface', 'surface', 'surface']);
  });

  it('shows bars with minimum and maximum for a single axis with few values', () => {
    chart['setDimension']('x', {kind: 'type', type: ContextType.DAYS});
    chart['setDimension']('y', null);

    expect(graph().title).toBe('Überschuss: Tage');
    expect(graph().data.map(trace => [trace.type, trace.name])).toEqual([['bar', 'Minimum'], ['bar', 'Maximum']]);
  });

  it('drops the y axis when the x axis takes its dimension', () => {
    chart['setDimension']('x', {kind: 'type', type: ContextType.LEADERS});

    expect(axes().y).toBeNull();
    // 2 bis 8 Leiter: wenige Werte, also Säulen statt einer Linie
    expect(graph().data[0].type).toBe('bar');
  });

  it('keeps the chosen axes for a new result', () => {
    chart['setDimension']('x', {kind: 'type', type: ContextType.DAYS});
    const result = evaluate(planToData(plan), true);
    fixture.componentRef.setInput('results', new ScenarioResults(result.scenarios, result.values, plan.contextRange));
    fixture.componentRef.setInput('perParticipant', true);

    expect(axes().x).toEqual({kind: 'type', type: ContextType.DAYS});
    expect(graph().title).toBe('Überschuss pro Teilnehmer: Tage × Leiter');
  });

  it('follows renamed cities', () => {
    const dinslaken = plan.contextRange.getCities()[0];
    const label = () => chart['dimensionOptions']().find(option => option.dimension.kind === 'city')!.label;
    expect(label()).toBe('Teilnehmer aus Dinslaken');

    TestBed.inject(PlanStore).setCityName(dinslaken, 'Dinslaken-Nord');

    expect(label()).toBe('Teilnehmer aus Dinslaken-Nord');
  });
});
