import {
  ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners
} from '@angular/core';
import {provideServiceWorker} from '@angular/service-worker';
import {MatIconRegistry} from '@angular/material/icon';
import {CurrencyPipe} from '@angular/common';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    CurrencyPipe,
    // Material Symbols statt der älteren Material Icons, wie von Material Design 3 empfohlen
    provideAppInitializer((): void => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
    // Offline nutzbar, etwa im Zeltlager ohne Netz; beim nächsten Besuch startet die App sofort aus dem Cache
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
