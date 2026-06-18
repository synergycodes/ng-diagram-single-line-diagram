import type { Edge, NgDiagramConfig, NgDiagramModelService, Node, Port } from 'ng-diagram';
import type { SymbolRegistryService } from '../../../symbols/symbol-registry.service';
import { GRID, PORT_SNAP_PX } from '../geometry/constants';
import {
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  SLD_JUNCTION_SIZE_PX,
  portKind,
  type SldLinkEdgeData,
} from '../geometry/node-types';

// ng-diagram bridge: the single place that translates SLD rules (grid, snapping,
// orthogonal routing, connection validity, edge decoration) into an
// `NgDiagramConfig`. Keeps ng-diagram's config shape out of the rest of the app.
// Closures read live state — ng-diagram re-evaluates them per tick.
export function buildDiagramConfig(deps: {
  readonly registry: SymbolRegistryService;
  readonly modelService: NgDiagramModelService;
}): NgDiagramConfig {
  const { registry, modelService } = deps;
  const getSymbol = (id: string) => registry.getById(id);
  return {
    background: {
      cellSize: { width: GRID, height: GRID },
      majorLinesFrequency: { x: 10, y: 10 },
    },
    snapping: {
      shouldSnapDragForNode: () => true,
      computeSnapForNodeDrag: () => ({ width: GRID, height: GRID }),
      defaultDragSnap: { width: GRID, height: GRID },
    },

    resize: {
      defaultResizable: false,
      getMinNodeSize: (node: Node) =>
        node.type === SLD_JUNCTION_NODE_TYPE
          ? { width: SLD_JUNCTION_SIZE_PX, height: SLD_JUNCTION_SIZE_PX }
          : { width: GRID * 2, height: GRID * 2 },
    },
    nodeRotation: {
      // Symbols opt in per-node (rotatable: true); junctions stay fixed. Snap to
      // quarter turns so geometry stays grid-aligned.
      defaultRotatable: false,
      shouldSnapForNode: () => true,
      computeSnapAngleForNode: () => 90,
    },
    edgeRouting: {
      defaultRouting: 'orthogonal',
      orthogonal: {
        // from/toEndSegmentLength: auto edges leave a port with a short
        // perpendicular stub before turning (a bottom port exits down, not
        // sideways). Junction-incident links opt out via SLD_LINK_NOSTUB_ROUTING.
        firstLastSegmentLength: GRID * 2,
        maxCornerRadius: 0,
      },
    },
    linking: {
      // Shared with the relink/link-drop overlays so the native draw gesture
      // and our custom gestures snap with the same gravity.
      portSnapDistance: PORT_SNAP_PX,
      validateConnection: (
        source: Node | null,
        sourcePort: Port | null,
        target: Node | null,
        targetPort: Port | null,
      ): boolean => {
        if (!source || !target || !sourcePort || !targetPort) return false;
        // No symbol self-loops — terminals never wire to each other internally.
        if (source.id === target.id && source.type !== SLD_JUNCTION_NODE_TYPE) {
          return false;
        }
        // Power and control terminals don't mix. Unknown kind (port not in
        // the registry) is treated as power so legacy nodes still link.
        const sk = portKind(source, sourcePort.id, getSymbol);
        const tk = portKind(target, targetPort.id, getSymbol);
        if (sk && tk && sk !== tk) return false;
        return true;
      },
      // SLD links are undirected — strip arrowheads. Control sources also
      // get the custom edge type so rubber-band stays dashed mid-gesture.
      temporaryEdgeDataBuilder: (edge: Edge): Edge =>
        snapDanglingEndpointsToGrid(decorateEdgeForKind(edge, registry, modelService)),
      finalEdgeDataBuilder: (edge: Edge): Edge => decorateEdgeForKind(edge, registry, modelService),
    },
    zoom: {
      // Toolbar "fit" is the explicit recentre.
      zoomToFit: { onInit: false },
    },
  };
}

// Stamp the source-port kind onto the edge so `SldControlEdgeComponent`
// renders dashed for control. Power edges leave `type` unset.
function decorateEdgeForKind(
  edge: Edge,
  registry: SymbolRegistryService,
  modelService: NgDiagramModelService,
): Edge {
  const base: Edge = {
    ...edge,
    sourceArrowhead: undefined,
    targetArrowhead: undefined,
  };
  if (!edge.source || !edge.sourcePort) return base;
  const node = modelService.getNodeById(edge.source);
  const kind = portKind(node, edge.sourcePort, (id) => registry.getById(id));
  if (kind !== 'control') return base;
  return {
    ...base,
    type: SLD_CONTROL_LINK_EDGE_TYPE,
    data: { ...(base.data as SldLinkEdgeData | undefined), kind: 'control' },
  };
}

// Snap the cursor-side endpoint of a temp edge to GRID so the rubber-band
// tracks the same grid the user is laying out against.
function snapDanglingEndpointsToGrid(edge: Edge): Edge {
  let result = edge;
  if ((!edge.target || edge.target === '') && edge.targetPosition) {
    result = { ...result, targetPosition: snapPointToGrid(edge.targetPosition) };
  }
  if ((!edge.source || edge.source === '') && edge.sourcePosition) {
    result = { ...result, sourcePosition: snapPointToGrid(edge.sourcePosition) };
  }
  return result;
}

function snapPointToGrid(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(p.x / GRID) * GRID,
    y: Math.round(p.y / GRID) * GRID,
  };
}
