import {Directive, ElementRef, forwardRef, HostListener, inject} from '@angular/core';
import {ControlValueAccessor, NG_VALUE_ACCESSOR} from '@angular/forms';

/** Formatiert einen Betrag deutsch mit zwei Nachkommastellen, z. B. „1.234,50“. */
export function formatEuro(value: number | null, grouping: boolean = true): string {
  return value === null ? '' : value.toLocaleString('de', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: grouping
  });
}

/** Liest einen eingetippten Betrag; Komma und Punkt gelten beide als Dezimaltrenner. */
export function parseEuro(text: string): number | null | undefined {
  const normalized: string = text.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') {
    return null;
  }
  const value: number = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Eingabefeld für Euro-Beträge: zeigt zwei Nachkommastellen, solange es nicht bearbeitet wird. */
@Directive({
  selector: 'input[appEuroInput]',
  host: {type: 'text', inputmode: 'decimal'},
  providers: [{provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => EuroInputDirective), multi: true}],
})
export class EuroInputDirective implements ControlValueAccessor {

  private readonly element: HTMLInputElement = inject(ElementRef<HTMLInputElement>).nativeElement;
  private value: number | null = null;
  private onChange: (value: number | null) => void = (): void => {};
  private onTouched: () => void = (): void => {};

  writeValue(value: number | null): void {
    this.value = value;
    if (document.activeElement !== this.element) {
      this.element.value = formatEuro(value);
    }
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  @HostListener('focus')
  protected focus(): void {
    // Ohne Tausenderpunkte, damit sich der Betrag beim Bearbeiten eindeutig lesen lässt
    this.element.value = formatEuro(this.value, false);
    this.element.select();
  }

  @HostListener('input')
  protected input(): void {
    const value: number | null | undefined = parseEuro(this.element.value);
    if (value !== undefined) {
      this.value = value;
      this.onChange(value);
    }
  }

  @HostListener('blur')
  protected blur(): void {
    this.element.value = formatEuro(this.value);
    this.onTouched();
  }
}
