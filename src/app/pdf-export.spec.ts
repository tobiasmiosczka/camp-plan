import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PdfExport } from './pdf-export';
import { ChartSource, ReportChart } from './report';
import { PlanStore } from './plan-store';

function chart(title: string): ChartSource {
  const image: ReportChart = {title, subtitle: '', image: 'data:image/jpeg;base64,', aspect: 0.5};
  return {printImage: () => Promise.resolve(image)};
}

describe('PdfExport', () => {
  let pdf: PdfExport;
  let store: PlanStore;

  beforeEach(async () => {
    pdf = TestBed.inject(PdfExport);
    store = TestBed.inject(PlanStore);
    await TestBed.inject(ApplicationRef).whenStable();
  });

  it('builds the report from the plan and its result', async () => {
    pdf.registerChart('scenario', chart('Überschuss'));
    pdf.registerChart('distribution', chart('Verteilung'));

    const report = await pdf.report();

    expect(report.name).toBe('Beispiel-Zeltlager');
    expect(report.scenarioCount).toBe(15498);
    expect(report.balance.min).toBeCloseTo(478.7, 9);
    expect(report.balance.max).toBeCloseTo(3078.1, 9);
    expect(report.participants).toEqual({start: 20, end: 66});
    expect(report.debit[0]).toEqual({
      title: 'Verpflegung', amount: 7, factors: 'pro Person × pro Tag', sum: {min: 308, max: 1554},
    });
    expect(report.chart?.title).toBe('Überschuss');
    expect(report.distribution?.title).toBe('Verteilung');
    expect(pdf.chartsRequested()).toBe(false);
  });

  it('reports the result of the latest change, not of a calculation still running', async () => {
    pdf.registerChart('scenario', chart('Überschuss'));
    pdf.registerChart('distribution', chart('Verteilung'));

    store.setAmount(store.plan().credit.at(-1)!, 0);
    const report = await pdf.report();

    expect(report.balance.min).toBeLessThan(0);
    expect(report.deficitShare).toBe(1);
  });

  it('requests the charts when they are not loaded yet and waits for them', async () => {
    const report = pdf.report();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(pdf.chartsRequested()).toBe(true);

    pdf.registerChart('scenario', chart('Überschuss'));
    pdf.registerChart('distribution', chart('Verteilung'));

    expect((await report).chart?.title).toBe('Überschuss');
  });

  it('forgets a chart once it is gone', async () => {
    const unregister = pdf.registerChart('scenario', chart('Überschuss'));
    pdf.registerChart('distribution', chart('Verteilung'));
    unregister();

    const report = pdf.report();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(pdf.chartsRequested()).toBe(true);
    pdf.registerChart('scenario', chart('Neu'));
    expect((await report).chart?.title).toBe('Neu');
  });
});
