import { ComponentFixture, TestBed } from '@angular/core/testing';
import { evaluate } from '../../calculation/engine';
import {Plan} from '../../calculation/plan';
import {defaultPlan} from '../../calculation/starter-plans';
import {ScenarioResults} from '../../calculation/scenario-results';
import { ScenarioChart } from './scenario-chart';
import { changedAt } from '../../testing/plans';

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
    const result = evaluate(plan, false);
    fixture = TestBed.createComponent(ScenarioChart);
    fixture.componentRef.setInput('results', new ScenarioResults(result.scenarios, result.values, plan));
    fixture.componentRef.setInput('cities', plan.cities);
    chart = fixture.componentInstance;
  });

  it('compares participants and leaders on a surface by default', () => {
    expect(axes().x).toEqual({kind: 'type', type: 'participants'});
    expect(axes().y).toEqual({kind: 'type', type: 'leaders'});
    expect(graph().title).toBe('Überschuss: Teilnehmer gesamt × Leiter');
    expect(graph().data.map(trace => trace.type)).toEqual(['surface', 'surface', 'surface']);
  });

  it('shows bars with minimum and maximum for a single axis with few values', () => {
    chart['setDimension']('x', {kind: 'type', type: 'days'});
    chart['setDimension']('y', null);

    expect(graph().title).toBe('Überschuss: Tage');
    expect(graph().data.map(trace => [trace.type, trace.name])).toEqual([['bar', 'Minimum'], ['bar', 'Maximum']]);
  });

  it('drops the y axis when the x axis takes its dimension', () => {
    chart['setDimension']('x', {kind: 'type', type: 'leaders'});

    expect(axes().y).toBeNull();
    // 2 bis 8 Leiter: wenige Werte, also Säulen statt einer Linie
    expect(graph().data[0]!.type).toBe('bar');
  });

  it('keeps the chosen axes for a new result', () => {
    chart['setDimension']('x', {kind: 'type', type: 'days'});
    const result = evaluate(plan, true);
    fixture.componentRef.setInput('results', new ScenarioResults(result.scenarios, result.values, plan));
    fixture.componentRef.setInput('perParticipant', true);

    expect(axes().x).toEqual({kind: 'type', type: 'days'});
    expect(graph().title).toBe('Überschuss pro Teilnehmer: Tage × Leiter');
  });

  it('follows renamed cities', () => {
    const label = () => chart['dimensionOptions']().find(option => option.dimension.kind === 'city')!.label;
    expect(label()).toBe('Teilnehmer aus Dinslaken');

    const renamed = changedAt(plan.cities, 0, city => ({...city, name: 'Dinslaken-Nord'}));
    fixture.componentRef.setInput('cities', renamed);

    expect(label()).toBe('Teilnehmer aus Dinslaken-Nord');
  });
});
