import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { PlotlyModule } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';
import { AccountPanel } from './account-panel';

describe('AccountPanel', () => {
  let component: AccountPanel;
  let fixture: ComponentFixture<AccountPanel>;

  beforeEach(async () => {
    registerLocaleData(localeDe);
    await TestBed.configureTestingModule({
      imports: [AccountPanel, PlotlyModule.forRoot(PlotlyJS)],
      providers: [CurrencyPipe],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountPanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
