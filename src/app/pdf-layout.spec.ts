import { jsPDF } from 'jspdf';
import { renderPdf } from './pdf-layout';
import { Report, ReportPosition } from './report';

function report(overrides: Partial<Report> = {}): Report {
  const position = (title: string): ReportPosition => ({title, amount: 10, factors: 'pro Tag', sum: {min: 20, max: 30}});
  return {
    name: 'Sommerlager',
    perParticipant: false,
    days: {start: 2, end: 3},
    leaders: {start: 2, end: 8},
    participants: {start: 20, end: 66},
    cities: [{name: 'Dinslaken', participants: {start: 20, end: 60}}],
    scenarioCount: 15498,
    deficitShare: 0,
    debit: [position('Bus'), position('Halle')],
    credit: [position('Beitrag')],
    debitTotal: {min: 40, max: 60},
    creditTotal: {min: 20, max: 30},
    balance: {min: -40, max: -10},
    chart: null,
    distribution: null,
    ...overrides,
  };
}

/** Der Inhalt einer Seite als PDF-Befehle; Texte stehen darin in Klammern. */
function page(doc: jsPDF, number: number): string {
  return (doc.internal as unknown as { pages: string[][] }).pages[number].join('\n');
}

describe('renderPdf', () => {
  it('keeps the summary on page 1 and starts the expenses on page 2', () => {
    const doc = renderPdf(report());

    expect(page(doc, 1)).toContain('(Sommerlager)');
    expect(page(doc, 1)).toContain('(Rahmenbedingungen)');
    expect(page(doc, 1)).not.toContain('(Bus)');
    expect(page(doc, 2)).toContain('(Bus)');
    expect(page(doc, 2)).toContain('(Einnahmen)');
  });

  it('numbers every page', () => {
    const doc = renderPdf(report());
    const pages = doc.getNumberOfPages();

    for (let number = 1; number <= pages; number++) {
      expect(page(doc, number)).toContain(`(Seite ${number} von ${pages})`);
    }
  });

  it('shows the amounts per participant when asked to', () => {
    expect(page(renderPdf(report({perParticipant: true})), 2)).toContain('(Summe pro Teilnehmer)');
  });

  it('adds the charts only when there are any', () => {
    const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=';
    const without = renderPdf(report());
    const withCharts = renderPdf(report({chart: {title: 'Überschuss nach Tagen', subtitle: '', image, aspect: 0.5}}));

    const text = (doc: jsPDF): string => Array.from({length: doc.getNumberOfPages()}, (_, i) => page(doc, i + 1)).join('\n');
    expect(text(without)).not.toContain('Tagen)');
    expect(text(withCharts)).toContain('Tagen)');
  });
});
