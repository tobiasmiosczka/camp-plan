import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {formatEuro, formatEuroRange, formatInteger, formatPercent} from '../format/format';
import {Report, ReportChart, ReportCity, ReportPosition} from './report';
import {DE, Messages} from '../i18n/de';
import {Range} from '../calculation/range';
import {ValueRange} from '../calculation/value-range';

/** Farben des hellen Themes – die PDF ist immer hell. */
const PRIMARY: [number, number, number] = [0, 106, 106];
const ERROR: [number, number, number] = [180, 30, 30];

/**
 * Das Sparschwein aus dem Favicon als PNG für den Titel; jsPDF bettet kein SVG ein. Ohne Datei oder Canvas (offline
 * ohne Cache, in Tests unter jsdom) null: Die PDF kommt dann ohne Symbol aus.
 */
export async function piggyBankImage(size: number = 160): Promise<string | null> {
  try {
    const svg: Document = new DOMParser().parseFromString(await (await fetch('favicon.svg')).text(), 'image/svg+xml');
    // Das Favicon folgt dem Farbmodus; die PDF ist immer hell
    svg.querySelectorAll('style').forEach((style: Element): void => style.remove());
    svg.querySelectorAll('path').forEach((path: Element): void => path.setAttribute('fill', `rgb(${PRIMARY.join(',')})`));
    const image = new Image(size, size);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await image.decode();
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    context.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

type Options = Parameters<typeof autoTable>[1];
type Cell = Parameters<NonNullable<Options['didParseCell']>>[0];

/** Ein A4-Dokument mit der Schreibposition `y`; neue Seiten beginnen am oberen Rand. */
class PdfWriter {

  readonly doc = new jsPDF({unit: 'mm', format: 'a4'});
  readonly margin: number = 15;
  /** Breite zwischen den Rändern. */
  readonly width: number = this.doc.internal.pageSize.getWidth() - 2 * this.margin;
  y: number = this.margin;

  constructor(readonly t: Messages) {
  }

  get pageHeight(): number {
    return this.doc.internal.pageSize.getHeight();
  }

  newPage(): void {
    this.doc.addPage();
    this.y = this.margin;
  }

  /** Beginnt eine neue Seite, wenn auf dieser keine `height` Millimeter mehr Platz sind. */
  ensureSpace(height: number): void {
    if (this.y + height > this.pageHeight - this.margin) {
      this.newPage();
    }
  }

  /** Eine Überschrift; mit Platz für die ersten Zeilen darunter, sonst auf der nächsten Seite. */
  heading(text: string): void {
    this.ensureSpace(HEADING_SPACE);
    this.doc.setFont('helvetica', 'bold').setFontSize(13).text(text, this.margin, this.y + 5);
    this.y += 8;
  }

  /** Eine Tabelle ab `y`; danach steht `y` unter ihr. */
  table(options: Options, right: number[] = [], style?: (data: Cell) => void): void {
    autoTable(this.doc, this.format(options, right, style));
    this.y = finalY(this.doc) + 8;
  }

  /** Höhe einer Tabelle, gemessen in einem unsichtbaren Probedokument; länger als eine Seite: unendlich. */
  measure(options: Options, right: number[]): number {
    const probe = new jsPDF({unit: 'mm', format: 'a4'});
    autoTable(probe, this.format(options, right, undefined, this.margin));
    return probe.getNumberOfPages() > 1 ? Infinity : finalY(probe) - this.margin;
  }

  /** Alle Tabellen im selben Format. `right`: Spalten mit Zahlen, rechtsbündig in Kopf, Inhalt und Fuß. */
  format(options: Options, right: number[], style?: (data: Cell) => void, startY: number = this.y): Options {
    const margin: number = this.margin;
    return {
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
    };
  }
}

/** Platz, den eine Überschrift mindestens unter sich braucht, damit sie nicht allein am Seitenende steht. */
const HEADING_SPACE: number = 25;

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/**
 * Setzt den Report als A4-Dokument: Übersicht, Rahmenbedingungen und Städte auf Seite 1, ab Seite 2 Ausgaben,
 * Einnahmen und die Diagramme, jede Seite nummeriert.
 */
export function renderPdf(report: Report, piggyBank: string | null = null, t: Messages = DE): jsPDF {
  const pdf = new PdfWriter(t);
  title(pdf, report, piggyBank);
  overview(pdf, report);
  settingsAndCities(pdf, report);
  // Ausgaben beginnen immer auf einer neuen Seite; Seite 1 bleibt die Zusammenfassung
  if (pdf.y > pdf.margin) {
    pdf.newPage();
  }
  positions(pdf, report, t.common.debit, report.debit, report.debitTotal);
  positions(pdf, report, t.common.credit, report.credit, report.creditTotal);
  for (const content of [report.chart, report.distribution]) {
    if (content) {
      chart(pdf, content);
    }
  }
  pageNumbers(pdf);
  return pdf.doc;
}

/** „ pro Teilnehmer“ hinter Beträgen, wenn der Report sie so zeigt. */
function per(report: Report, t: Messages): string {
  return report.perParticipant ? ` ${t.common.perParticipant}` : '';
}

/** Titel ist der Projektname; ohne Namen der allgemeine Titel. Lange Namen brechen um. */
function title(pdf: PdfWriter, report: Report, piggyBank: string | null): void {
  const {doc, t, margin} = pdf;
  const icon: number = 8;
  const name: string = report.name.trim();
  const titleLines: string[] = doc.setFont('helvetica', 'bold').setFontSize(18)
    .splitTextToSize(name || t.pdf.title, pdf.width - icon - 3);
  if (piggyBank !== null) {
    doc.addImage(piggyBank, 'PNG', margin, pdf.y, icon, icon);
  }
  doc.text(titleLines, margin + icon + 3, pdf.y + 6.5);
  pdf.y += (titleLines.length - 1) * 7.5;
  const stand: string = t.pdf.asOf(new Date());
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
    .text(name ? `${t.pdf.subtitle}  ·  ${stand}` : stand, margin, pdf.y + 12)
    .setTextColor(0);
  pdf.y += 18;
}

/** Kurzfassung ganz oben; der Überschuss als erste, hervorgehobene Zeile. */
function overview(pdf: PdfWriter, report: Report): void {
  const t: Messages = pdf.t;
  const suffix: string = per(report, t);
  const euroRange = (range: ValueRange): string => formatEuroRange(range, t.locale);
  const negative: boolean = report.balance.min < 0;
  pdf.heading(t.pdf.overview);
  pdf.table({
    head: [[t.pdf.key, t.pdf.value]],
    body: [
      [suffix ? `${t.common.surplus}${suffix}` : t.pdf.surplusTotal, euroRange(report.balance)],
      [`${t.common.credit}${suffix}`, euroRange(report.creditTotal)],
      [`${t.common.debit}${suffix}`, euroRange(report.debitTotal)],
      [t.pdf.scenarios, formatInteger(report.scenarioCount, t.locale)],
      [t.pdf.deficitScenarios, formatPercent(report.deficitShare, t.locale)],
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
}

/** Rahmenbedingungen und Städte nebeneinander, jede Tabelle in einer halben Seitenbreite. */
function settingsAndCities(pdf: PdfWriter, report: Report): void {
  const {doc, t, margin} = pdf;
  const gap: number = 6;
  const half: number = (pdf.width - gap) / 2;
  const columns: { title: string, x: number, options: Options }[] = [{
    title: t.settings.title,
    x: margin,
    options: {
      head: [[t.pdf.setting, t.common.from, t.common.to]],
      body: ([[t.common.days, report.days], [t.common.leaders, report.leaders],
        [t.common.participantsTotal, report.participants]] satisfies [string, Range][])
        .map(([label, range]: [string, Range]): string[] => [label, `${range.start}`, `${range.end}`]),
    },
  }, {
    title: t.cities.title,
    x: margin + half + gap,
    options: {
      head: [[t.common.city, t.common.from, t.common.to]],
      body: report.cities.map((city: ReportCity): string[] =>
        [city.name, `${city.participants.start}`, `${city.participants.end}`]),
    },
  }];
  pdf.ensureSpace(HEADING_SPACE);
  const top: number = pdf.y;
  const startPage: number = doc.getCurrentPageInfo().pageNumber;
  // Weiter geht es unter der längeren Tabelle, auch wenn viele Städte auf die nächste Seite reichen
  let end: { page: number, y: number } = {page: startPage, y: top};
  for (const column of columns) {
    doc.setPage(startPage);
    doc.setFont('helvetica', 'bold').setFontSize(13).text(column.title, column.x, top + 5);
    pdf.y = top + 8;
    const pageWidth: number = doc.internal.pageSize.getWidth();
    autoTable(doc, pdf.format({
      ...column.options,
      margin: {left: column.x, right: pageWidth - column.x - half, top: margin, bottom: margin},
    }, [1, 2]));
    const page: number = doc.getCurrentPageInfo().pageNumber;
    if (page > end.page || (page === end.page && finalY(doc) > end.y)) {
      end = {page, y: finalY(doc)};
    }
  }
  doc.setPage(end.page);
  pdf.y = end.y + 8;
}

/** Ausgaben oder Einnahmen, möglichst auf einer Seite: Passt die Tabelle nicht mehr, vorher umbrechen. */
function positions(pdf: PdfWriter, report: Report, heading: string, rows: ReportPosition[], total: ValueRange): void {
  const t: Messages = pdf.t;
  const euroRange = (range: ValueRange): string => formatEuroRange(range, t.locale);
  const options: Options = {
    head: [[t.pdf.position, t.positions.amount, t.positions.multipliedBy, `${t.positions.sum}${per(report, t)}`]],
    body: rows.map((row: ReportPosition): string[] =>
      [row.title, formatEuro(row.amount, t.locale), row.factors || '–', euroRange(row.sum)]),
    foot: [[t.positions.total(heading), '', '', euroRange(total)]],
  };
  const needed: number = 8 + pdf.measure(options, [1, 3]);
  // Länger als eine ganze Seite: dann hilft kein Umbruch, die Tabelle läuft wie gewohnt weiter
  if (Number.isFinite(needed)) {
    pdf.ensureSpace(needed);
  }
  pdf.heading(heading);
  pdf.table(options, [1, 3]);
}

/** Ein Diagramm in voller Breite mit Überschrift und Untertitel, nie über einen Seitenumbruch hinweg. */
function chart(pdf: PdfWriter, content: ReportChart): void {
  const {doc, margin, width} = pdf;
  const height: number = width * content.aspect;
  pdf.ensureSpace(height + 14);
  pdf.heading(content.title);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
    .text(doc.splitTextToSize(content.subtitle, width), margin, pdf.y + 1)
    .setTextColor(0);
  pdf.y += 6;
  doc.addImage(content.image, 'JPEG', margin, pdf.y, width, height);
  pdf.y += height + 8;
}

function pageNumbers(pdf: PdfWriter): void {
  const {doc, t, margin, width} = pdf;
  const pages: number = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
      .text(t.pdf.page(page, pages), margin + width, pdf.pageHeight - 8, {align: 'right'});
  }
}
