import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {formatEuro, formatEuroRange, formatInteger, formatPercent} from './format';
import {Report, ReportChart, ReportCity, ReportPosition} from './report';
import {DE, Messages} from './i18n/de';
import {Range} from './calculation/range';
import {ValueRange} from './value-range';

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

/**
 * Setzt den Report als A4-Dokument: Übersicht, Rahmenbedingungen und Städte auf Seite 1, ab Seite 2 Ausgaben,
 * Einnahmen und die Diagramme, jede Seite nummeriert.
 */
export function renderPdf(report: Report, piggyBank: string | null = null, t: Messages = DE): jsPDF {
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const margin: number = 15;
  const width: number = doc.internal.pageSize.getWidth() - 2 * margin;
  const per: string = report.perParticipant ? ` ${t.common.perParticipant}` : '';
  const euro = (value: number): string => formatEuro(value, t.locale);
  const euroRange = (range: ValueRange): string => formatEuroRange(range, t.locale);
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
      head: [[t.pdf.position, t.positions.amount, t.positions.multipliedBy, `${t.positions.sum}${per}`]],
      body: rows.map((row: ReportPosition): string[] =>
        [row.title, euro(row.amount), row.factors || '–', euroRange(row.sum)]),
      foot: [[t.positions.total(title), '', '', euroRange(total)]],
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
    .splitTextToSize(name || t.pdf.title, width - icon - 3);
  if (piggyBank !== null) {
    doc.addImage(piggyBank, 'PNG', margin, y, icon, icon);
  }
  doc.text(titleLines, margin + icon + 3, y + 6.5);
  y += (titleLines.length - 1) * 7.5;
  const stand: string = t.pdf.asOf(new Date());
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
    .text(name ? `${t.pdf.subtitle}  ·  ${stand}` : stand, margin, y + 12)
    .setTextColor(0);
  y += 18;

  // Kurzfassung ganz oben; der Überschuss als erste, hervorgehobene Zeile
  const negative: boolean = report.balance.min < 0;
  const share: string = formatPercent(report.deficitShare, t.locale);
  heading(t.pdf.overview);
  table({
    head: [[t.pdf.key, t.pdf.value]],
    body: [
      [per ? `${t.common.surplus}${per}` : t.pdf.surplusTotal, euroRange(report.balance)],
      [`${t.common.credit}${per}`, euroRange(report.creditTotal)],
      [`${t.common.debit}${per}`, euroRange(report.debitTotal)],
      [t.pdf.scenarios, formatInteger(report.scenarioCount, t.locale)],
      [t.pdf.deficitScenarios, share],
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
    title: t.settings.title,
    x: margin,
    options: {
      head: [[t.pdf.setting, t.common.from, t.common.to]],
      body: [report.days, report.leaders, report.participants].map((range: Range, i: number): string[] =>
        [[t.common.days, t.common.leaders, t.common.participantsTotal][i], `${range.start}`, `${range.end}`]),
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
  positions(t.common.debit, report.debit, report.debitTotal);
  positions(t.common.credit, report.credit, report.creditTotal);


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
      .text(t.pdf.page(page, pages), margin + width, doc.internal.pageSize.getHeight() - 8, {align: 'right'});
  }
  return doc;
}
