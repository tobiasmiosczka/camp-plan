import { formatAmount, formatEuro, formatEuroRange, formatInteger, formatPercent, separators } from './format';
import { parseEuro } from './euro-input';

describe('format', () => {
  it('writes euros as each language does', () => {
    expect(formatEuro(-1234.5, 'de')).toBe('-1.234,50 €');
    expect(formatEuro(-1234.5, 'en')).toBe('-€1,234.50');
  });

  it('allows a line break in a range only after the dash', () => {
    expect(formatEuroRange({min: 1, max: 2}, 'de')).toBe('1,00 € – 2,00 €');
    expect(formatEuroRange({min: 2, max: 2}, 'de')).toBe('2,00 €');
  });

  it('writes amounts for input fields with two decimals', () => {
    expect(formatAmount(1234.5, 'de')).toBe('1.234,50');
    expect(formatAmount(7, 'de', false)).toBe('7,00');
    expect(formatAmount(1234.5, 'en')).toBe('1,234.50');
    expect(formatAmount(null, 'de')).toBe('');
  });

  it('writes shares and counts', () => {
    expect(formatPercent(0.125, 'de')).toBe('12,5 %');
    expect(formatPercent(0.125, 'en')).toBe('12.5%');
    expect(formatInteger(15498, 'de')).toBe('15.498');
  });

  it('tells Plotly the separators of the language', () => {
    expect(separators('de')).toBe(',.');
    expect(separators('en')).toBe('.,');
  });
});

describe('parseEuro', () => {
  it('parses comma and dot as decimal separator', () => {
    expect(parseEuro('7,5')).toBe(7.5);
    expect(parseEuro('7.5')).toBe(7.5);
    expect(parseEuro('')).toBeNull();
    expect(parseEuro('abc')).toBeUndefined();
  });
});
