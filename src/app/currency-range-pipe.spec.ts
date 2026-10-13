import { CurrencyRangePipe } from './currency-range-pipe';

describe('CurrencyRangePipe', () => {
  const pipe = new CurrencyRangePipe();

  it('formats a range in the given language', () => {
    expect(pipe.transform({ min: 1, max: 1234.5 }, 'de')).toBe('1,00 € – 1.234,50 €');
    expect(pipe.transform({ min: 1, max: 1234.5 }, 'en')).toBe('€1.00 – €1,234.50');
  });

  it('shows equal values only once', () => {
    expect(pipe.transform({ min: 595, max: 595 }, 'de')).toBe('595,00 €');
  });
});
