import {formatEuro, parseEuro} from './euro-input';

describe('euro input', () => {
  it('formats with two decimals', () => {
    expect(formatEuro(1234.5)).toBe('1.234,50');
    expect(formatEuro(7, false)).toBe('7,00');
    expect(formatEuro(null)).toBe('');
  });

  it('parses comma and dot as decimal separator', () => {
    expect(parseEuro('7,5')).toBe(7.5);
    expect(parseEuro('7.5')).toBe(7.5);
    expect(parseEuro('')).toBeNull();
    expect(parseEuro('abc')).toBeUndefined();
  });
});
