import { Injectable, signal } from '@angular/core';

export interface ExportHandlers {
  readonly svg: () => void;
  readonly dxf: () => void;
}

/**
 * Root-level bridge so page-level chrome (the navbar Export buttons) can trigger
 * the exports that live inside the diagram's DI scope. `SvgExportService` /
 * `DxfExportService` depend on services provided on `DiagramComponent`, so they
 * can't be injected above the diagram — `DiagramComponent` registers the
 * handlers on init and the navbar calls `exportSvg()` / `exportDxf()`.
 */
@Injectable({ providedIn: 'root' })
export class ExportBridgeService {
  private handlers: ExportHandlers | null = null;

  readonly ready = signal(false);

  register(handlers: ExportHandlers): void {
    this.handlers = handlers;
    this.ready.set(true);
  }

  exportSvg(): void {
    this.handlers?.svg();
  }

  exportDxf(): void {
    this.handlers?.dxf();
  }
}
