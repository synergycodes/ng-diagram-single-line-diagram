import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import { JunctionsService } from '../features/junctions';
import { isSymbolNode, isWireNode } from '../core/geometry/node-types';
import {
  computeWorldBbox,
  emptySvg,
  renderEdge,
  renderJunctionDot,
  renderSymbolNode,
  renderWireNode,
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

  // Serialize the whole live model to a standalone SVG string, in paint order:
  // edges under symbol/wire bodies, junction dots on top. Returns an empty SVG
  // when nothing is drawn.
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
      } else if (isWireNode(node)) {
        elements.push(renderWireNode(node));
      }
    }

    // Drawn last so they sit on top of overlapping wire ends.
    for (const junction of this.junctionsService.junctions()) {
      elements.push(renderJunctionDot(junction));
    }

    return wrapSvgDocument(elements, bbox);
  }
}
