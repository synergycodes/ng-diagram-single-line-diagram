import type { SymbolDef } from '../../../symbols/types';
import {
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  SLD_SYMBOL_NODE_TYPE,
} from '../../core/geometry/node-types';
import { DxfLayer } from '../dxf/dxf-layer';
import { DxfTextStyle } from '../dxf/dxf-text-style';
import type { DxfExportConfig } from '../dxf/dxf-types';
import { ACI, DIAGRAM_PADDING, DXF_SCALE_MM_PER_PX, LAYERS, TEXT_STYLE } from './sld-dxf-constants';
import { renderJunctionNode } from './junction-node-renderer';
import { renderControlLink, renderPowerLink } from './link-edge-renderer';
import { createSymbolNodeRenderer } from './symbol-node-renderer';

export interface SldDxfConfigDeps {
  /** Resolve a symbol definition by id (backed by SymbolRegistryService). */
  readonly getSymbol: (id: string) => SymbolDef | undefined;
}

/**
 * Wires the SLD renderers into the generic DxfExporter.
 *
 * To support a new node or edge type:
 *   1. Write a renderer function (see symbol-node-renderer.ts as a model).
 *   2. Register it here under the matching `node.type` / `edge.type` key.
 * Nothing in the generic `dxf/` library needs to change.
 */
export const buildSldDxfConfig = (deps: SldDxfConfigDeps): DxfExportConfig => ({
  scaleMmPerPx: DXF_SCALE_MM_PER_PX,
  paddingPx: DIAGRAM_PADDING,
  layers: [
    new DxfLayer(LAYERS.SYMBOLS, ACI.WHITE),
    new DxfLayer(LAYERS.LINKS, ACI.WHITE),
    new DxfLayer(LAYERS.LINKS_CONTROL, ACI.WHITE),
    new DxfLayer(LAYERS.JUNCTIONS, ACI.WHITE),
  ],
  textStyles: [new DxfTextStyle(TEXT_STYLE.STANDARD), new DxfTextStyle(TEXT_STYLE.BOLD, true)],
  nodeRenderers: {
    [SLD_SYMBOL_NODE_TYPE]: createSymbolNodeRenderer(deps.getSymbol),
    [SLD_JUNCTION_NODE_TYPE]: renderJunctionNode,
  },
  edgeRenderers: {
    [SLD_CONTROL_LINK_EDGE_TYPE]: renderControlLink,
  },
  // Power links leave `edge.type` undefined (ng-diagram default edge).
  defaultEdgeRenderer: renderPowerLink,
});
