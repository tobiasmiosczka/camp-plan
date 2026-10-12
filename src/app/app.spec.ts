import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    registerLocaleData(localeDe);
    await TestBed.configureTestingModule({
      imports: [App],
      // Wie in app.config.ts; die Diagramme bleiben ungeladen, sie bräuchten WebGL
      providers: [CurrencyPipe],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the app bar title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.title')?.textContent).toContain('CampPlan');
  });
});
