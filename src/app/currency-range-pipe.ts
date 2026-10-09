import {inject, Pipe, PipeTransform} from '@angular/core';
import {ValueRange} from './value-range';
import {CurrencyPipe} from '@angular/common';

@Pipe({
  name: 'currencyRange',
  standalone: true
})
export class CurrencyRangePipe implements PipeTransform {
  private currencyPipe: CurrencyPipe = inject(CurrencyPipe);

  transform(
    range: ValueRange,
    currencyCode: string = 'EUR',
    display: 'symbol' | 'code' | 'symbol-narrow' = 'symbol',
    digitsInfo: string = '1.2-2',
    locale: string = 'de'
  ): string {
    const min: string | null = this.currencyPipe.transform(range.min, currencyCode, display, digitsInfo, locale);
    const max: string | null = this.currencyPipe.transform(range.max, currencyCode, display, digitsInfo, locale);

    // Gleiche Werte nur einmal anzeigen; Umbruch nur nach dem Gedankenstrich erlauben
    return min === max ? `${min}` : `${min}\u00A0– ${max}`;
  }
}
