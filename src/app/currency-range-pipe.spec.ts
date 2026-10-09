import { CurrencyPipe } from '@angular/common';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { CurrencyRangePipe } from './currency-range-pipe';

describe('CurrencyRangePipe', () => {
  let pipe: CurrencyRangePipe;

  beforeEach(() => {
    registerLocaleData(localeDe);
    TestBed.configureTestingModule({ providers: [CurrencyPipe] });
    pipe = TestBed.runInInjectionContext(() => new CurrencyRangePipe());
  });

  it('formats a range', () => {
    expect(pipe.transform({ min: 1, max: 1234.5 })).toBe('1,00 € – 1.234,50 €');
  });

  it('shows equal values only once', () => {
    expect(pipe.transform({ min: 595, max: 595 })).toBe('595,00 €');
  });
});
