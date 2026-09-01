import type { Edge, Node } from 'ng-diagram';
import { junctionNodeAt } from '../features/junctions';
import {
  SLD_JUNCTION_PORT_IDS,
  SLD_SYMBOL_NODE_TYPE,
  type SldLinkEdgeData,
  type SldSymbolNodeData,
} from '../core/geometry/node-types';
import type { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import type { SymbolDef, TerminalSide } from '../../symbols/types';

/** Document name shown in the navbar, matching the seeded bay. */
export const INITIAL_SCHEMATIC_NAME = '220/110 kV Substation – Bay T1';

/**
 * Screen-space insets the opening zoom-to-fit keeps clear of the chrome that
 * floats over the canvas, so the seeded bay lands in the free area. Derived
 * from `src/tokens.css`: `--gutter` 12, `--h-header` 48, `--w-panel-lib` 320.
 */
export const INITIAL_FIT_PADDING: [number, number, number, number] = [72, 48, 72, 344];

const JUNCTION_ID = 'sld-junction-t1-tap';

// World x of the two vertical axes: the main feeder and the arrester branch.
const COLUMN_X = 400;
const BRANCH_X = 560;

// World centre of the junction the arrester branch taps off the feeder.
const JUNCTION_CENTRE = { x: COLUMN_X, y: 296 };

// One symbol instance: registry symbol, the vertical axis it sits on, and the y
// of its bounding-box top edge. Size comes from the registry, so regenerating
// the symbols keeps the bay aligned.
interface SymbolPlacement {
  readonly id: string;
  readonly symbolId: string;
  readonly axisX: number;
  readonly top: number;
}

const SYMBOLS: readonly SymbolPlacement[] = [
  { id: 'qs1', symbolId: 'disconnector', axisX: COLUMN_X, top: 0 },
  { id: 'q1', symbolId: 'breaker', axisX: COLUMN_X, top: 104 },
  { id: 'ti1', symbolId: 'ct', axisX: COLUMN_X, top: 208 },
  { id: 't1', symbolId: 'transformer', axisX: COLUMN_X, top: 376 },
  { id: 'qs2', symbolId: 'disconnector', axisX: COLUMN_X, top: 512 },
  { id: 'fv1', symbolId: 'surge-arrester', axisX: BRANCH_X, top: 360 },
  { id: 'pe1', symbolId: 'ground', axisX: BRANCH_X, top: 512 },
];

// An edge end: a symbol terminal named by the side it leaves from, or a
// junction port.
type LinkEnd =
  | { readonly node: string; readonly side: TerminalSide }
  | { readonly junction: string; readonly port: string };

const LINKS: readonly { readonly from: LinkEnd; readonly to: LinkEnd }[] = [
  { from: { node: 'qs1', side: 'bottom' }, to: { node: 'q1', side: 'top' } },
  { from: { node: 'q1', side: 'bottom' }, to: { node: 'ti1', side: 'top' } },
  {
    from: { node: 'ti1', side: 'bottom' },
    to: { junction: JUNCTION_ID, port: SLD_JUNCTION_PORT_IDS.top },
  },
  {
    from: { junction: JUNCTION_ID, port: SLD_JUNCTION_PORT_IDS.bottom },
    to: { node: 't1', side: 'top' },
  },
  {
    from: { junction: JUNCTION_ID, port: SLD_JUNCTION_PORT_IDS.right },
    to: { node: 'fv1', side: 'top' },
  },
  { from: { node: 'fv1', side: 'bottom' }, to: { node: 'pe1', side: 'top' } },
  { from: { node: 't1', side: 'bottom' }, to: { node: 'qs2', side: 'top' } },
];

/** Nodes and edges for the starting diagram, sized from the symbol registry. */
export function buildInitialModel(registry: SymbolRegistryService): {
  nodes: Node[];
  edges: Edge[];
} {
  const placed = new Map<string, SymbolDef>();
  const nodes: Node[] = [];

  for (const placement of SYMBOLS) {
    const def = registry.getById(placement.symbolId);
    // A symbol missing from the registry drops out of the seed rather than
    // stranding the app on an unrenderable node.
    if (!def) continue;
    placed.set(placement.id, def);
    nodes.push(symbolNode(placement, def));
  }

  nodes.push(junctionNodeAt(JUNCTION_CENTRE, JUNCTION_ID, 'power'));

  const edges: Edge[] = [];
  for (const link of LINKS) {
    const from = resolveEnd(link.from, placed);
    const to = resolveEnd(link.to, placed);
    if (!from || !to) continue;
    edges.push({
      id: `sld-link-${from.node}-${to.node}`,
      source: from.node,
      sourcePort: from.port,
      target: to.node,
      targetPort: to.port,
      data: { kind: 'power' } satisfies SldLinkEdgeData,
    });
  }

  return { nodes, edges };
}

function symbolNode(placement: SymbolPlacement, def: SymbolDef): Node<SldSymbolNodeData> {
  const size = def.displaySize;
  return {
    id: placement.id,
    type: SLD_SYMBOL_NODE_TYPE,
    position: { x: placement.axisX - size.width / 2, y: placement.top },
    size: { width: size.width, height: size.height },
    autoSize: false,
    rotatable: true,
    data: {
      symbolId: def.id,
      properties: { ...def.defaultData },
    },
  };
}

function resolveEnd(
  end: LinkEnd,
  placed: ReadonlyMap<string, SymbolDef>,
): { node: string; port: string } | null {
  if ('junction' in end) return { node: end.junction, port: end.port };
  const def = placed.get(end.node);
  const terminal = def?.terminals.find((candidate) => candidate.side === end.side);
  return terminal ? { node: end.node, port: terminal.id } : null;
}
