import {Dimension} from '../../calculation/dimension';
import {evaluate} from '../../calculation/engine';
import {ScenarioResults} from '../../calculation/scenario-results';
import {DE} from '../../i18n/de';
import {planWith} from '../../testing/plans';
import {testPlan} from '../../testing/test-plan';
import {ChartStyle} from '../chart-style';
import {scenarioFigure} from './scenario-figure';

describe('scenarioFigure', () => {
  const style = new ChartStyle(DE);
  const label = (dimension: Dimension): string => dimension.kind === 'type' ? dimension.type : 'Stadt';
  const results = (plan = testPlan()): ScenarioResults => {
    const result = evaluate(plan, false);
    return new ScenarioResults(result.scenarios, result.values, plan);
  };

  it('falls back to the x axis when neither axis varies', () => {
    const figure = scenarioFigure(style, {
      results: results(), x: {kind: 'type', type: 'days'}, y: {kind: 'type', type: 'days'}, perParticipant: false, label,
    });

    expect(figure.title).toBe('Überschuss: days');
    expect(figure.data.map(trace => trace.type)).toEqual(['bar', 'bar']);
  });

  it('draws a line instead of bars for many values', () => {
    const plan = testPlan();
    const many = {...plan, leaders: {start: 0, end: 20}};
    const figure = scenarioFigure(style, {
      results: results(many), x: {kind: 'type', type: 'leaders'}, y: null, perParticipant: false, label,
    });

    expect(figure.data[0]!.type).toBe('scatter');
  });

  it('says so when there are no scenarios', () => {
    const figure = scenarioFigure(style, {
      results: results(planWith()), x: {kind: 'type', type: 'days'}, y: null, perParticipant: true, label,
    });

    expect(figure.data).toEqual([]);
    expect(figure.subtitle).toBe(DE.charts.noScenarios);
  });
});
