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

/** Sparschwein „savings“ aus Material Symbols (wie Favicon und App-Leiste), viewBox 0 -960 960 960. */
const PIGGY_BANK_PATH = 'M668.5-531.5Q680-543 680-560t-11.5-28.5Q657-600 640-600t-28.5 11.5Q600-577 600-560t11.5 28.5Q623-520 640-520t28.5-11.5ZM320-620h200v-60H320v60ZM180-120q-34-114-67-227.5T80-580q0-92 64-156t156-64h200q29-38 70.5-59t89.5-21q25 0 42.5 17.5T720-820q0 6-1.5 12t-3.5 11q-4 11-7.5 22.5T702-751l91 91h87v279l-113 37-67 224H480v-80h-80v80H180Zm45-60h115v-80h200v80h115l63-210 102-35v-175h-52L640-728q1-25 6.5-48.5T658-824q-38 10-72 29.5T534-740H300q-66.29 0-113.14 46.86Q140-646.29 140-580q0 103.16 29 201.58Q198-280 225-180Zm255-322Z';

/** Primary-Farbe des hellen Themes – die PDF ist immer hell. */
const PRIMARY: [number, number, number] = [0, 106, 106];

/** jsPDF bettet kein SVG ein; deshalb wird der Pfad über eine Canvas zu einem PNG. */
function piggyBankImage(size: number = 160): string {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context: CanvasRenderingContext2D = canvas.getContext('2d')!;
  context.scale(size / 960, size / 960);
  context.translate(0, 960);
  context.fillStyle = `rgb(${PRIMARY.join(',')})`;
  context.fill(new Path2D(PIGGY_BANK_PATH));
  return canvas.toDataURL('image/png');
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
        headStyles: {fillColor: PRIMARY},
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

    const icon: number = 8;
    doc.addImage(piggyBankImage(), 'PNG', margin, y, icon, icon);
    doc.setFont('helvetica', 'bold').setFontSize(18).text('CampPlan – Kalkulation', margin + icon + 3, y + 6.5);
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
    const balanceColor: [number, number, number] = report.balance.min < 0 ? [180, 30, 30] : PRIMARY;
    doc.setFont('helvetica', 'bold').setFontSize(16)
      .setTextColor(...balanceColor)
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
