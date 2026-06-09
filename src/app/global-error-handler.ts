import { ErrorHandler, Injectable } from '@angular/core';

// Single funnel for uncaught runtime errors. The app reaches into ng-diagram
// internals and runs raw pointer math, so route those failures here instead of
// letting them die in a handler. Swap console for a reporter later.
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error('[sld] uncaught', error);
  }
}
