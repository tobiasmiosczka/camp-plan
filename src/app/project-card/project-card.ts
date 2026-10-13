import {Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {LanguageStore} from '../language-store';
import {PlanStore} from '../plan-store';

/** Der Projektname als Überschrift des Plans. */
@Component({
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule],
  selector: 'app-project-card',
  styleUrl: './project-card.css',
  templateUrl: './project-card.html',
})
export class ProjectCard {

  private readonly store = inject(PlanStore);
  protected readonly t = inject(LanguageStore).messages;

  protected readonly name = this.store.name;

  protected rename(name: string): void {
    this.store.rename(name);
  }
}
