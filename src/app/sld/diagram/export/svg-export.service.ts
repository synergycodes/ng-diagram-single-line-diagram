import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import { JunctionsService } from '../features/junctions';
import { isSymbolNode } from '../core/geometry/node-types';
import {
  computeWorldBbox,
  emptySvg,
  renderEdge,
  renderJunctionDot,
  renderSymbolNode,
  wrapSvgDocument,
} from './svg-markup';

// Builds an editable vector SVG directly from the model — html-to-image's
// foreignObject output is not round-trippable through Illustrator/Inkscape.
// This service only walks the live model and orders the paint; the SVG
// string-building lives in the `svg-markup` module.
@Injectable()
export class SvgExportService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);
  private readonly junctionsService = inject(JunctionsService);

  // Paint order: edges under symbol bodies, junction dots on top.
  exportToSvg(): string {
    const nodes = this.modelService.nodes();
    const edges = this.modelService.edges();
    const bbox = computeWorldBbox(nodes, edges);
    if (!bbox) return emptySvg();

    const elements: string[] = [];
    // Edges first so they sit under symbol bodies — symbols cap edges visually
    // at their bbox edge, which is what the router already targets.
    for (const edge of edges) {
      const rendered = renderEdge(edge);
      if (rendered) elements.push(rendered);
    }
    for (const node of nodes) {
      if (isSymbolNode(node)) {
        elements.push(renderSymbolNode(node, this.registry.getById(node.data.symbolId)));
      }
    }

    // Drawn last so they sit on top of overlapping edge ends.
    for (const junction of this.junctionsService.junctions()) {
      elements.push(renderJunctionDot(junction));
    }

    return wrapSvgDocument(elements, bbox);
  }
}
