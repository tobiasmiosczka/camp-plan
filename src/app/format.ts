import {ValueRange} from './value-range';

/**
 * Alle Zahlenformate der App an einer Stelle, damit Oberfläche, Diagramme und PDF Beträge gleich schreiben.
 * Jede Funktion bekommt die Locale ausdrücklich: Sie kommt aus der gewählten Sprache, nie aus einem Standardwert.
 */

/** Intl.NumberFormat anzulegen ist teuer; je Locale und Format gibt es deshalb nur einen. */
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key: string = `${locale} ${JSON.stringify(options)}`;
  let result: Intl.NumberFormat | undefined = formatters.get(key);
  if (result === undefined) {
    result = new Intl.NumberFormat(locale, options);
    formatters.set(key, result);
  }
  return result;
}

/** Betrag mit Euro-Zeichen, deutsch „1.234,50 €“, englisch „€1,234.50“. */
export function formatEuro(value: number, locale: string): string {
  return formatter(locale, {style: 'currency', currency: 'EUR'}).format(value);
}

/** Zwei Beträge als Spanne, gleiche nur einmal. Umbrechen darf die Zeile nur nach dem Gedankenstrich. */
export function formatEuroRange(range: ValueRange, locale: string): string {
  const min: string = formatEuro(range.min, locale);
  const max: string = formatEuro(range.max, locale);
  return min === max ? min : `${min} – ${max}`;
}

/** Betrag ohne Euro-Zeichen mit zwei Nachkommastellen, wie in Eingabefeldern; ohne Wert leer. */
export function formatAmount(value: number | null, locale: string, grouping: boolean = true): string {
  return value === null ? ''
    : formatter(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: grouping}).format(value);
}

/** Anteil von 0 bis 1 als Prozent mit höchstens einer Nachkommastelle, z. B. „12,5 %“. */
export function formatPercent(share: number, locale: string): string {
  return formatter(locale, {style: 'percent', maximumFractionDigits: 1}).format(share);
}

/** Ganze Zahl mit Tausendertrennern, z. B. „15.498“. */
export function formatInteger(value: number, locale: string): string {
  return formatter(locale, {maximumFractionDigits: 0}).format(value);
}

/** Steht das Euro-Zeichen vor dem Betrag (englisch „€12“) oder dahinter (deutsch „12 €“)? */
export function euroFirst(locale: string): boolean {
  return formatEuro(1, locale).startsWith('€');
}

/** Dezimalzeichen und Tausendertrenner der Locale, in dieser Reihenfolge, wie Plotly sie erwartet. */
export function separators(locale: string): string {
  const parts: Intl.NumberFormatPart[] = formatter(locale, {}).formatToParts(1234.5);
  const part = (type: string): string => parts.find((p: Intl.NumberFormatPart): boolean => p.type === type)?.value ?? '';
  return part('decimal') + part('group');
}
