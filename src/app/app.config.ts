import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { routes } from './app.routes';
import { GlobalErrorHandler } from './global-error-handler';

// Root DI providers for the standalone app (passed to bootstrapApplication).
export const appConfig: ApplicationConfig = {
  providers: [
    // Coalesce events so a burst of DOM events triggers a single change-detection pass.
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Used by the icon system to fetch SVG files from `assets/icons/`.
    provideHttpClient(),
    provideRouter(
      routes,
      // Bind matched route params straight to component inputs.
      withComponentInputBinding(),
      withViewTransitions(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    // Route every uncaught error through our single funnel (see GlobalErrorHandler).
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
