import {inject, Pipe, PipeTransform} from '@angular/core';
import {ValueRange} from './value-range';
import {CurrencyPipe} from '@angular/common';

@Pipe({
  name: 'currencyRange',
  standalone: true
})
export class CurrencyRangePipe implements PipeTransform {
  private currencyPipe: CurrencyPipe = inject(CurrencyPipe);

  /** Die Locale als Argument statt aus einem Signal: Eine reine Pipe rechnet nur neu, wenn sich ihre Argumente ändern. */
  transform(range: ValueRange, locale: string = 'de'): string {
    const min: string | null = this.currencyPipe.transform(range.min, 'EUR', 'symbol', '1.2-2', locale);
    const max: string | null = this.currencyPipe.transform(range.max, 'EUR', 'symbol', '1.2-2', locale);

    // Gleiche Werte nur einmal anzeigen; Umbruch nur nach dem Gedankenstrich erlauben
    return min === max ? `${min}` : `${min}\u00A0– ${max}`;
  }
}
