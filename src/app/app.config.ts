import {
  ApplicationConfig, importProvidersFrom, inject, provideAppInitializer, provideBrowserGlobalErrorListeners
} from '@angular/core';
import {MatIconRegistry} from '@angular/material/icon';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import * as PlotlyJS from 'plotly.js-dist-min';
import {PlotlyModule} from 'angular-plotly.js';
import {CurrencyPipe} from '@angular/common';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    CurrencyPipe,
    importProvidersFrom(PlotlyModule.forRoot(PlotlyJS)),
    // Material Symbols statt der älteren Material Icons, wie von Material Design 3 empfohlen
    provideAppInitializer((): void => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
  ]
};
