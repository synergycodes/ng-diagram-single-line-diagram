import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import { buildSldDxfConfig } from './dxf-sld/sld-dxf-config';
import { DxfExporter } from './dxf/dxf-exporter';
import { DxfWriter } from './dxf/dxf-writer';

// Builds a DXF (AutoCAD R2000+) document straight from the live model — the
// CAD counterpart to SvgExportService. The generic `dxf/` library is a
// domain-free, vendored serializer; this service only walks the model, hands
// it to the SLD-configured DxfExporter, and serialises the result.
@Injectable()
export class DxfExportService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);

  exportToDxf(): string {
    const nodes = this.modelService.nodes();
    const edges = this.modelService.edges();
    const bounds = this.modelService.computePartsBounds(nodes, edges);

    const config = buildSldDxfConfig({ getSymbol: (id) => this.registry.getById(id) });
    const doc = new DxfExporter(config).export(nodes, edges, bounds);
    return new DxfWriter().serialize(doc);
  }
}
