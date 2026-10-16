import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { MediaMatcher } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { fileErrorMessage } from '../i18n/labels';
import { Language, LANGUAGES, LanguageStore } from '../language-store';
import { Plan } from '../calculation/plan';
import { PlanStore } from '../plan-store';
import { Undo } from '../undo';
import { ThemeStore } from '../theme-store';
import { PdfExport } from '../pdf-export';
import { PlanCalculation } from '../plan-calculation';

@Component({
  imports: [
    MatProgressBarModule, MatToolbarModule, MatIconModule, MatButtonModule, MatDividerModule, MatMenuModule, MatSlideToggleModule, MatTooltipModule
  ],
  selector: 'app-top-app-bar',
  styleUrl: './top-app-bar.css',
  templateUrl: './top-app-bar.html',
})
export class TopAppBar {
  private readonly store = inject(PlanStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly undo = inject(Undo);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly piggyBank = viewChild.required('piggyBank', {read: ElementRef<HTMLElement>});

  /** Münzen, die gerade ins Sparschwein fallen; jeder Klick wirft eine weitere ein. */
  protected readonly coins = signal<number[]>([]);
  private nextCoin: number = 0;
  private readonly reducedMotion: MediaQueryList = inject(MediaMatcher).matchMedia('(prefers-reduced-motion: reduce)');

  protected readonly perParticipant = this.store.perParticipant;

  /** Fortschritt einer langen Rechnung für den Ladebalken unter der App-Leiste; sonst null. */
  protected readonly progress = inject(PlanCalculation).progress;

  protected readonly theme = inject(ThemeStore);
  private readonly pdfExport = inject(PdfExport);
  protected readonly exporting = signal(false);
  protected readonly dark = this.theme.dark;

  protected readonly languageStore = inject(LanguageStore);
  protected readonly language = this.languageStore.language;
  protected readonly t = this.languageStore.messages;
  protected readonly languages = (Object.keys(LANGUAGES) as Language[])
    .map((language: Language): { language: Language, name: string } => ({language, name: LANGUAGES[language].name}));

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
    if (this.reducedMotion.matches) {
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
      this.snackBar.open(error instanceof Error ? error.message : this.t().topBar.pdfFailed, this.t().common.ok);
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
      this.snackBar.open(this.t().topBar.opened(file.name), undefined, {duration: 3000});
    } catch (error) {
      this.snackBar.open(fileErrorMessage(error, this.t()), this.t().common.ok);
    }
  }

  protected reset(): void {
    const previous: Plan = this.store.plan();
    this.store.reset();
    this.undo.offer(this.t().topBar.exampleLoaded, (): void => this.store.restore(previous));
  }

  protected resetAll(): void {
    const previous = {
      plan: this.store.plan(), perParticipant: this.perParticipant(), dark: this.dark(), language: this.language(),
    };
    this.store.clear();
    this.theme.reset();
    this.languageStore.reset();
    this.undo.offer(this.t().topBar.allReset, (): void => {
      this.store.restore(previous.plan);
      this.perParticipant.set(previous.perParticipant);
      this.theme.setDark(previous.dark);
      this.languageStore.setLanguage(previous.language);
    }, 8000);
  }
}
