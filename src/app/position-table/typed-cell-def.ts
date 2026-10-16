import {Directive, input} from '@angular/core';

/**
 * Gibt `let element` in `*matCellDef` den Typ der Tabellenzeilen, sonst ist es `any`:
 * `*matCellDef="let element; table: rows()"`. Tut zur Laufzeit nichts.
 */
@Directive({selector: '[matCellDef][matCellDefTable]'})
export class TypedCellDef<T> {

  readonly matCellDefTable = input.required<readonly T[]>();

  static ngTemplateContextGuard<T>(_directive: TypedCellDef<T>, context: unknown): context is { $implicit: T } {
    // Angular wertet nur die Signatur aus, beim Kompilieren der Templates
    return typeof context === 'object' && context !== null;
  }
}
