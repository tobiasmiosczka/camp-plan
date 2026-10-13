import { Component, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { AccountPanel } from './account-panel/account-panel';
import { TopAppBar } from './top-app-bar/top-app-bar';
import { PlanStore } from './plan-store';

@Component({
  imports: [AccountPanel, TopAppBar],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('camp-plan');

  constructor() {
    // Projektname im Browser-Tab, damit sich mehrere offene Pläne unterscheiden lassen
    const store: PlanStore = inject(PlanStore);
    const title: Title = inject(Title);
    effect((): void => {
      const name: string = store.name().trim();
      title.setTitle(name ? `${name} – CampPlan` : 'CampPlan');
    });
  }
}
