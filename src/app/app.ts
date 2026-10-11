import { Component, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterOutlet } from '@angular/router';
import { PlanStore } from './plan-store';
import { ThemeStore } from './theme-store';
import { PdfExport } from './pdf-export';
import { planToJson } from './calculation/plan';

@Component({
  imports: [
    RouterOutlet, MatToolbarModule, MatIconModule, MatButtonModule, MatDividerModule, MatMenuModule, MatSlideToggleModule, MatTooltipModule
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('camp-plan');

  private readonly store = inject(PlanStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly piggyBank = viewChild.required('piggyBank', {read: ElementRef<HTMLElement>});

  /** Münzen, die gerade ins Sparschwein fallen; jeder Klick wirft eine weitere ein. */
  protected readonly coins = signal<number[]>([]);
  private nextCoin: number = 0;

  protected readonly perParticipant = this.store.perParticipant;

  constructor() {
    // Projektname im Browser-Tab, damit sich mehrere offene Pläne unterscheiden lassen
    const title: Title = inject(Title);
    effect((): void => {
      const name: string = this.store.name().trim();
      title.setTitle(name ? `${name} – CampPlan` : 'CampPlan');
    });
  }

  protected readonly theme = inject(ThemeStore);
  private readonly pdfExport = inject(PdfExport);
  protected readonly exporting = signal(false);
  protected readonly dark = this.theme.dark;

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

  protected dropCoin(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const coin: number = this.nextCoin++;
    this.coins.update((coins: number[]): number[] => [...coins, coin]);
  }

  /** Die Münze ist im Schlitz verschwunden: Das Schwein wackelt kurz. */
  protected coinLanded(coin: number): void {
    this.coins.update((coins: number[]): number[] => coins.filter((other: number): boolean => other !== coin));
    this.piggyBank().nativeElement.animate([
      {transform: 'none'},
      {transform: 'translateY(2px) scale(1.15, 0.85)'},
      {transform: 'translateY(-2px) rotate(-8deg)'},
      {transform: 'rotate(5deg)'},
      {transform: 'none'},
    ], {duration: 450, easing: 'ease-out'});
  }

  protected save(): void {
    this.store.download();
  }

  protected async exportPdf(): Promise<void> {
    this.exporting.set(true);
    try {
      await this.pdfExport.download();
    } catch (error) {
      this.snackBar.open(error instanceof Error ? error.message : 'PDF konnte nicht erstellt werden.', 'OK');
    } finally {
      this.exporting.set(false);
    }
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

  protected resetAll(): void {
    const previous = {plan: planToJson(this.store.plan()), perParticipant: this.perParticipant(), dark: this.dark()};
    this.store.clear();
    this.theme.reset();
    this.snackBar
      .open('Alle Einstellungen zurückgesetzt', 'Rückgängig', {duration: 8000})
      .onAction()
      .subscribe((): void => {
        this.store.load(previous.plan);
        this.perParticipant.set(previous.perParticipant);
        this.theme.setDark(previous.dark);
      });
  }
}
