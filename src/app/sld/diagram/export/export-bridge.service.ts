import { Injectable, signal } from '@angular/core';

/**
 * Root-level bridge so page-level chrome (the navbar Export button) can trigger
 * the SVG export that lives inside the diagram's DI scope. `SvgExportService`
 * depends on `JunctionsService` (provided on `DiagramComponent`), so it
 * can't be injected above the diagram — `DiagramComponent` registers the
 * handler on init and the navbar calls `export()`.
 */
@Injectable({ providedIn: 'root' })
export class ExportBridgeService {
  private handler: (() => void) | null = null;

  readonly ready = signal(false);

  register(handler: () => void): void {
    this.handler = handler;
    this.ready.set(true);
  }

  export(): void {
    this.handler?.();
  }
}
