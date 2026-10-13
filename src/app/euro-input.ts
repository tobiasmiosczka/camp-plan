import {Directive, effect, ElementRef, forwardRef, HostListener, inject} from '@angular/core';
import {ControlValueAccessor, NG_VALUE_ACCESSOR} from '@angular/forms';
import {formatAmount} from './format';
import {LanguageStore} from './language-store';

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
  private readonly messages = inject(LanguageStore).messages;
  private value: number | null = null;
  private onChange: (value: number | null) => void = (): void => {};
  private onTouched: () => void = (): void => {};

  constructor() {
    // Beim Sprachwechsel mit den Trennzeichen der neuen Sprache anzeigen; beim Bearbeiten bleibt das Feld, wie es ist
    effect((): void => {
      this.messages();
      if (document.activeElement !== this.element) {
        this.element.value = this.format(this.value);
      }
    });
  }

  writeValue(value: number | null): void {
    this.value = value;
    if (document.activeElement !== this.element) {
      this.element.value = this.format(value);
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
    this.element.value = this.format(this.value, false);
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
    this.element.value = this.format(this.value);
    this.onTouched();
  }

  private format(value: number | null, grouping: boolean = true): string {
    return formatAmount(value, this.messages().locale, grouping);
  }
}
