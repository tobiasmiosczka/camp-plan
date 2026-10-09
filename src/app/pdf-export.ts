import {Injectable} from '@angular/core';
import {Range} from './calculation/position';
import {ValueRange} from './value-range';

export interface ReportPosition {
  title: string;
  amount: number;
  factors: string;
  sum: ValueRange;
}

export interface ReportCity {
  name: string;
  participants: Range;
}

/** Alles, was die PDF zeigt – zusammengestellt vom Konto, das die Szenarien bereits durchgerechnet hat. */
export interface Report {
  perParticipant: boolean;
  days: Range;
  leaders: Range;
  participants: Range;
  cities: ReportCity[];
  scenarioCount: number;
  debit: ReportPosition[];
  credit: ReportPosition[];
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
  chart: { title: string; subtitle: string; image: string } | null;
}

export function formatEuro(value: number): string {
  return value.toLocaleString('de', {style: 'currency', currency: 'EUR'});
}

export function formatEuroRange(range: ValueRange): string {
  const min: string = formatEuro(range.min);
  const max: string = formatEuro(range.max);
  return min === max ? min : `${min} – ${max}`;
}

export function formatRange(range: Range): string {
  return range.start === range.end ? `${range.start}` : `${range.start}–${range.end}`;
}

/** Vermittelt zwischen dem Export-Button im Header und dem Konto, das die Zahlen kennt. */
@Injectable({providedIn: 'root'})
export class PdfExport {

  private source: (() => Promise<Report>) | null = null;

  setSource(source: (() => Promise<Report>) | null): void {
    this.source = source;
  }

  async download(): Promise<void> {
    if (!this.source) {
      throw new Error('Es gibt keine Rechnung zum Exportieren.');
    }
    const report: Report = await this.source();
    // Erst bei Bedarf laden, damit jsPDF den Start der App nicht verlangsamt
    const [{jsPDF}, {autoTable}] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

    const doc = new jsPDF({unit: 'mm', format: 'a4'});
    const margin: number = 15;
    const width: number = doc.internal.pageSize.getWidth() - 2 * margin;
    const per: string = report.perParticipant ? ' pro Teilnehmer' : '';
    let y: number = margin;

    const heading = (text: string): void => {
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = margin;
      }
      doc.setFont('helvetica', 'bold').setFontSize(13).text(text, margin, y + 5);
      y += 8;
    };
    /** `right`: Spalten mit Zahlen, rechtsbündig in Kopf, Inhalt und Fuß. */
    const table = (options: Parameters<typeof autoTable>[1], right: number[] = []): void => {
      autoTable(doc, {
        didParseCell: (data): void => {
          if (right.includes(data.column.index)) {
            data.cell.styles.halign = 'right';
          }
        },
        startY: y,
        margin: {left: margin, right: margin},
        styles: {font: 'helvetica', fontSize: 9, cellPadding: 1.5},
        headStyles: {fillColor: [0, 105, 115]},
        footStyles: {fillColor: [230, 236, 236], textColor: 20, fontStyle: 'bold'},
        ...options,
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    };
    const positions = (title: string, rows: ReportPosition[], total: ValueRange): void => {
      heading(title);
      table({
        head: [['Position', 'Betrag', 'Multipliziert mit', `Summe${per}`]],
        body: rows.map((row: ReportPosition): string[] =>
          [row.title, formatEuro(row.amount), row.factors || '–', formatEuroRange(row.sum)]),
        foot: [[`Summe ${title}`, '', '', formatEuroRange(total)]],
      }, [1, 3]);
    };

    doc.setFont('helvetica', 'bold').setFontSize(18).text('CampPlan – Kalkulation', margin, y + 6);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
      .text(`Stand: ${new Date().toLocaleString('de', {dateStyle: 'long', timeStyle: 'short'})}`, margin, y + 12)
      .setTextColor(0);
    y += 20;

    heading('Rahmenbedingungen');
    table({
      body: [
        ['Tage', formatRange(report.days)],
        ['Leiter', formatRange(report.leaders)],
        ['Teilnehmer gesamt', formatRange(report.participants)],
        ['Durchgerechnete Szenarien', report.scenarioCount.toLocaleString('de')],
      ],
      theme: 'plain',
      columnStyles: {0: {fontStyle: 'bold', cellWidth: 60}},
    });

    heading('Teilnehmende Städte');
    table({
      head: [['Stadt', 'Teilnehmer von', 'bis']],
      body: report.cities.map((city: ReportCity): string[] =>
        [city.name, `${city.participants.start}`, `${city.participants.end}`]),
      columnStyles: {0: {cellWidth: 90}},
    }, [1, 2]);

    positions('Ausgaben', report.debit, report.debitTotal);
    positions('Einnahmen', report.credit, report.creditTotal);

    heading(`Überschuss${per}`);
    doc.setFont('helvetica', 'bold').setFontSize(16)
      .setTextColor(report.balance.min < 0 ? 180 : 0, report.balance.min < 0 ? 30 : 105, report.balance.min < 0 ? 30 : 115)
      .text(formatEuroRange(report.balance), margin, y + 5)
      .setTextColor(0);
    y += 9;
    if (report.balance.min < 0) {
      doc.setFont('helvetica', 'normal').setFontSize(9).text('In mindestens einem Szenario entsteht ein Defizit.', margin, y + 3);
      y += 6;
    }
    y += 4;

    if (report.chart) {
      const height: number = width * 0.6;
      if (y + height + 14 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      heading(report.chart.title);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
        .text(doc.splitTextToSize(report.chart.subtitle, width), margin, y + 1)
        .setTextColor(0);
      y += 6;
      doc.addImage(report.chart.image, 'JPEG', margin, y, width, height);
    }

    const pages: number = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page).setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
        .text(`Seite ${page} von ${pages}`, margin + width, doc.internal.pageSize.getHeight() - 8, {align: 'right'});
    }
    doc.save(`camp-plan-${new Date().toISOString().slice(0, 10)}.pdf`);
  }
}
