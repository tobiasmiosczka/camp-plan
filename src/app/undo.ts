import {inject, Injectable} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {LanguageStore} from './language-store';

/** Meldet eine Änderung mit „Rückgängig“ in der Snackbar. */
@Injectable({providedIn: 'root'})
export class Undo {

  private readonly snackBar = inject(MatSnackBar);
  private readonly messages = inject(LanguageStore).messages;

  /** Ein Klick auf „Rückgängig“ ruft `undo` auf, solange die Meldung `duration` Millisekunden lang steht. */
  offer(message: string, undo: () => void, duration: number = 5000): void {
    this.snackBar.open(message, this.messages().common.undo, {duration}).onAction().subscribe(undo);
  }
}
