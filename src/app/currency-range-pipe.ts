import {Pipe, PipeTransform} from '@angular/core';
import {formatEuroRange} from './format';
import {ValueRange} from './value-range';

/** {@link formatEuroRange} für Templates. */
@Pipe({
  name: 'currencyRange',
})
export class CurrencyRangePipe implements PipeTransform {

  /** Die Locale als Argument statt aus einem Signal: Eine reine Pipe rechnet nur neu, wenn sich ihre Argumente ändern. */
  transform(range: ValueRange, locale: string): string {
    return formatEuroRange(range, locale);
  }
}
