import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterOutlet } from '@angular/router';
import { PlanStore } from './plan-store';
import { planToJson } from './calculation/plan';

@Component({
  imports: [RouterOutlet, MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('camp-plan');

  private readonly store = inject(PlanStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    if (event.key === 's') {
      event.preventDefault();
      this.save();
    } else if (event.key === 'o') {
      event.preventDefault();
      this.fileInput().nativeElement.click();
    }
  }

  protected save(): void {
    this.store.download();
  }

  protected async open(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      await this.store.open(file);
      this.snackBar.open(`„${file.name}“ geöffnet`, undefined, {duration: 3000});
    } catch (error) {
      this.snackBar.open(error instanceof Error ? error.message : 'Datei konnte nicht geöffnet werden.', 'OK');
    }
  }

  protected reset(): void {
    const previous = planToJson(this.store.plan());
    this.store.reset();
    this.snackBar
      .open('Beispielplan geladen', 'Rückgängig', {duration: 5000})
      .onAction()
      .subscribe((): void => this.store.load(previous));
  }
}
