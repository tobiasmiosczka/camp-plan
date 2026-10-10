import {Injectable} from '@angular/core';
import {Range} from './calculation/position';
import {ValueRange} from './value-range';
import {fileName} from './plan-store';

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

export interface ReportChart {
  title: string;
  subtitle: string;
  /** JPEG als Data-URL */
  image: string;
  /** Höhe im Verhältnis zur Breite */
  aspect: number;
}

/** Alles, was die PDF zeigt – zusammengestellt vom Konto, das die Szenarien bereits durchgerechnet hat. */
export interface Report {
  /** Projektname; leer, wenn keiner vergeben ist. */
  name: string;
  perParticipant: boolean;
  days: Range;
  leaders: Range;
  participants: Range;
  cities: ReportCity[];
  scenarioCount: number;
  /** Anteil der Szenarien mit Defizit, 0 bis 1. */
  deficitShare: number;
  debit: ReportPosition[];
  credit: ReportPosition[];
  debitTotal: ValueRange;
  creditTotal: ValueRange;
  balance: ValueRange;
  chart: ReportChart | null;
  distribution: ReportChart | null;
}

/** Sparschwein „savings“ aus Material Symbols (wie Favicon und App-Leiste), viewBox 0 -960 960 960. */
const PIGGY_BANK_PATH = 'M668.5-531.5Q680-543 680-560t-11.5-28.5Q657-600 640-600t-28.5 11.5Q600-577 600-560t11.5 28.5Q623-520 640-520t28.5-11.5ZM320-620h200v-60H320v60ZM180-120q-34-114-67-227.5T80-580q0-92 64-156t156-64h200q29-38 70.5-59t89.5-21q25 0 42.5 17.5T720-820q0 6-1.5 12t-3.5 11q-4 11-7.5 22.5T702-751l91 91h87v279l-113 37-67 224H480v-80h-80v80H180Zm45-60h115v-80h200v80h115l63-210 102-35v-175h-52L640-728q1-25 6.5-48.5T658-824q-38 10-72 29.5T534-740H300q-66.29 0-113.14 46.86Q140-646.29 140-580q0 103.16 29 201.58Q198-280 225-180Zm255-322Z';

/** Farben des hellen Themes – die PDF ist immer hell. */
const PRIMARY: [number, number, number] = [0, 106, 106];
const ERROR: [number, number, number] = [180, 30, 30];

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
    type Options = Parameters<typeof autoTable>[1];
    type Cell = Parameters<NonNullable<Options['didParseCell']>>[0];
    /** Alle Tabellen im selben Format. `right`: Spalten mit Zahlen, rechtsbündig in Kopf, Inhalt und Fuß. */
    const format = (options: Options, right: number[], style?: (data: Cell) => void, startY: number = y): Options => ({
      didParseCell: (data: Cell): void => {
        if (right.includes(data.column.index)) {
          data.cell.styles.halign = 'right';
        }
        style?.(data);
      },
      startY,
      margin: {left: margin, right: margin, top: margin, bottom: margin},
      styles: {font: 'helvetica', fontSize: 9, cellPadding: 1.5},
      headStyles: {fillColor: PRIMARY},
      footStyles: {fillColor: [230, 236, 236], textColor: 20, fontStyle: 'bold'},
      // Summenzeile nur am Ende, sonst wirkt sie auf jeder Seite wie eine Zwischensumme; der Kopf wiederholt sich
      showFoot: 'lastPage',
      ...options,
    });
    const finalY = (target: unknown): number => (target as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    const table = (options: Options, right: number[] = [], style?: (data: Cell) => void): void => {
      autoTable(doc, format(options, right, style));
      y = finalY(doc) + 8;
    };
    /** Höhe einer Tabelle, gemessen in einem unsichtbaren Probedokument mit derselben Seitengröße. */
    const measure = (options: Options, right: number[]): number => {
      const probe = new jsPDF({unit: 'mm', format: 'a4'});
      autoTable(probe, format(options, right, undefined, margin));
      return probe.getNumberOfPages() > 1 ? Infinity : finalY(probe) - margin;
    };
    /** Ausgaben und Einnahmen möglichst je auf einer Seite: passt die Tabelle nicht mehr, vorher umbrechen. */
    const positions = (title: string, rows: ReportPosition[], total: ValueRange): void => {
      const options: Options = {
        head: [['Position', 'Betrag', 'Multipliziert mit', `Summe${per}`]],
        body: rows.map((row: ReportPosition): string[] =>
          [row.title, formatEuro(row.amount), row.factors || '–', formatEuroRange(row.sum)]),
        foot: [[`Summe ${title}`, '', '', formatEuroRange(total)]],
      };
      const needed: number = 8 + measure(options, [1, 3]);
      // Länger als eine ganze Seite: dann hilft kein Umbruch, die Tabelle läuft wie gewohnt weiter
      if (y + needed > doc.internal.pageSize.getHeight() - margin && Number.isFinite(needed)) {
        doc.addPage();
        y = margin;
      }
      heading(title);
      table(options, [1, 3]);
    };

    // Titel ist der Projektname; ohne Namen der allgemeine Titel. Lange Namen brechen um.
    const icon: number = 8;
    const name: string = report.name.trim();
    const titleLines: string[] = doc.setFont('helvetica', 'bold').setFontSize(18)
      .splitTextToSize(name || 'CampPlan – Kalkulation', width - icon - 3);
    doc.addImage(piggyBankImage(), 'PNG', margin, y, icon, icon);
    doc.text(titleLines, margin + icon + 3, y + 6.5);
    y += (titleLines.length - 1) * 7.5;
    const stand: string = `Stand: ${new Date().toLocaleString('de', {dateStyle: 'long', timeStyle: 'short'})}`;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
      .text(name ? `CampPlan-Kalkulation  ·  ${stand}` : stand, margin, y + 12)
      .setTextColor(0);
    y += 18;

    // Kurzfassung ganz oben; der Überschuss als erste, hervorgehobene Zeile
    const negative: boolean = report.balance.min < 0;
    const share: string = report.deficitShare.toLocaleString('de', {style: 'percent', maximumFractionDigits: 1});
    heading('Übersicht');
    table({
      head: [['Kennzahl', 'Wert']],
      body: [
        [`Überschuss${per || ' gesamt'}`, formatEuroRange(report.balance)],
        [`Einnahmen${per}`, formatEuroRange(report.creditTotal)],
        [`Ausgaben${per}`, formatEuroRange(report.debitTotal)],
        ['Szenarien', report.scenarioCount.toLocaleString('de')],
        ['Szenarien mit Defizit', share],
      ],
      columnStyles: {0: {cellWidth: 90}},
    }, [1], (data: Cell): void => {
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 11;
        data.cell.styles.textColor = negative ? ERROR : PRIMARY;
      }
      if (data.section === 'body' && data.row.index === 4 && negative) {
        data.cell.styles.textColor = ERROR;
      }
    });

    // Rahmenbedingungen und Städte nebeneinander, jede Tabelle in einer halben Seitenbreite
    const gap: number = 6;
    const half: number = (width - gap) / 2;
    const columns: { title: string, x: number, options: Options }[] = [{
      title: 'Rahmenbedingungen',
      x: margin,
      options: {
        head: [['Rahmenbedingung', 'von', 'bis']],
        body: [report.days, report.leaders, report.participants].map((range: Range, i: number): string[] =>
          [['Tage', 'Leiter', 'Teilnehmer gesamt'][i], `${range.start}`, `${range.end}`]),
      },
    }, {
      title: 'Teilnehmende Städte',
      x: margin + half + gap,
      options: {
        head: [['Stadt', 'von', 'bis']],
        body: report.cities.map((city: ReportCity): string[] =>
          [city.name, `${city.participants.start}`, `${city.participants.end}`]),
      },
    }];
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
    const top: number = y;
    const startPage: number = doc.getCurrentPageInfo().pageNumber;
    // Weiter geht es unter der längeren Tabelle, auch wenn viele Städte auf die nächste Seite reichen
    let end: { page: number, y: number } = {page: startPage, y: top};
    for (const column of columns) {
      doc.setPage(startPage);
      doc.setFont('helvetica', 'bold').setFontSize(13).text(column.title, column.x, top + 5);
      y = top + 8;
      const pageWidth: number = doc.internal.pageSize.getWidth();
      autoTable(doc, format({
        ...column.options,
        margin: {left: column.x, right: pageWidth - column.x - half, top: margin, bottom: margin},
      }, [1, 2]));
      const page: number = doc.getCurrentPageInfo().pageNumber;
      if (page > end.page || (page === end.page && finalY(doc) > end.y)) {
        end = {page, y: finalY(doc)};
      }
    }
    doc.setPage(end.page);
    y = end.y + 8;

    // Ausgaben beginnen immer auf einer neuen Seite; Seite 1 bleibt die Zusammenfassung
    if (y > margin) {
      doc.addPage();
      y = margin;
    }
    positions('Ausgaben', report.debit, report.debitTotal);
    positions('Einnahmen', report.credit, report.creditTotal);


    const chart = (content: ReportChart): void => {
      const height: number = width * content.aspect;
      if (y + height + 14 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      heading(content.title);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
        .text(doc.splitTextToSize(content.subtitle, width), margin, y + 1)
        .setTextColor(0);
      y += 6;
      doc.addImage(content.image, 'JPEG', margin, y, width, height);
      y += height + 8;
    };
    if (report.chart) {
      chart(report.chart);
    }
    if (report.distribution) {
      chart(report.distribution);
    }

    const pages: number = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page).setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
        .text(`Seite ${page} von ${pages}`, margin + width, doc.internal.pageSize.getHeight() - 8, {align: 'right'});
    }
    doc.save(fileName(report.name, 'pdf'));
  }
}
