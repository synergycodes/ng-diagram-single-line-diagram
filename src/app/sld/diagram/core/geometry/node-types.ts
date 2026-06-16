// Node-type identifiers + `data` payload contracts.

import type { Edge, Node, Point } from 'ng-diagram';
import type { LinkKind, SymbolDef } from '../../../symbols/types';

export type { LinkKind };

export const SLD_SYMBOL_NODE_TYPE = 'sld-symbol';
export const SLD_WIRE_NODE_TYPE = 'sld-wire';

// Custom edge type for control (dashed) links. Power leaves `type` undefined.
export const SLD_CONTROL_LINK_EDGE_TYPE = 'sld-control-link';

// Routing name for junction-incident links: orthogonal with the end stub
// (from/toEndSegmentLength) zeroed — a junction is a meeting point, not a
// terminal, so an exit nub there reads as the branch shifted off the dot.
export const SLD_LINK_NOSTUB_ROUTING = 'sld-orthogonal-nostub';

// Edge `type` for a link of the given kind: control links carry the custom
// dashed edge type; power links leave `type` undefined (ng-diagram default).
// A partial spread onto an edge so callers don't repeat the kind check.
export function edgeShape(kind: LinkKind): { type?: string } {
  return kind === 'control' ? { type: SLD_CONTROL_LINK_EDGE_TYPE } : {};
}

// 8-px junction anchor with four directional ports. Materialised when an
// edge drops onto another; selectable and draggable like any node.
export const SLD_JUNCTION_NODE_TYPE = 'sld-junction';

// Four port sides at the junction centre. Branches pick the side facing
// their other end so the router doesn't converge from a common direction.
export const SLD_JUNCTION_PORT_IDS = {
  top: 'p-top',
  right: 'p-right',
  bottom: 'p-bottom',
  left: 'p-left',
} as const;

export type SldJunctionPortId = (typeof SLD_JUNCTION_PORT_IDS)[keyof typeof SLD_JUNCTION_PORT_IDS];

// Pick the port facing `towardsWorld` by dominant axis.
export function pickJunctionPortId(
  junctionCentre: { x: number; y: number },
  towardsWorld: { x: number; y: number },
): SldJunctionPortId {
  const dx = towardsWorld.x - junctionCentre.x;
  const dy = towardsWorld.y - junctionCentre.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? SLD_JUNCTION_PORT_IDS.right : SLD_JUNCTION_PORT_IDS.left;
  }
  return dy >= 0 ? SLD_JUNCTION_PORT_IDS.bottom : SLD_JUNCTION_PORT_IDS.top;
}

// Branch port at a split: perpendicular to splitAxis, on the side
// matching the branch's other end.
export function pickBranchJunctionPortId(
  segmentAxis: 'horizontal' | 'vertical',
  junctionCentre: { x: number; y: number },
  branchOtherEnd: { x: number; y: number },
): SldJunctionPortId {
  if (segmentAxis === 'horizontal') {
    return branchOtherEnd.y >= junctionCentre.y
      ? SLD_JUNCTION_PORT_IDS.bottom
      : SLD_JUNCTION_PORT_IDS.top;
  }
  return branchOtherEnd.x >= junctionCentre.x
    ? SLD_JUNCTION_PORT_IDS.right
    : SLD_JUNCTION_PORT_IDS.left;
}

// One grid cell. Ports sit 4 px from the centre.
export const SLD_JUNCTION_SIZE_PX = 8;

// Centre of a junction from its top-left `position` (ng-diagram positions are
// top-left, but port math and branch routing want the centre).
export function junctionCentre(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: position.x + SLD_JUNCTION_SIZE_PX / 2,
    y: position.y + SLD_JUNCTION_SIZE_PX / 2,
  };
}

// Power and control never meet at the same junction.
export interface SldJunctionNodeData {
  readonly kind?: LinkKind;
}

// `formerParentId`: shared by the two halves of a split parent so cleanup
//   can merge them back. Distinguishes "two halves of one wire" from
//   "two independent branches" — collapsing the latter would lose data.
// `kind`: defaults to 'power'. Persisted on the edge so dangling endpoints
//   keep their kind without walking back to a source port.
export interface SldLinkEdgeData {
  readonly formerParentId?: string;
  readonly kind?: LinkKind;
}

export function edgeKind(edge: Edge): LinkKind {
  return (edge.data as SldLinkEdgeData | undefined)?.kind ?? 'power';
}

// Resolve a port's link kind — the single source of truth. Symbol ports read
// their terminal kind from the registry (unknown -> 'power'); junction ports
// read data.kind. Null for a missing node, bad node type, or null port id.
export function portKind(
  node: Node | null | undefined,
  portId: string | null,
  getSymbol: (id: string) => SymbolDef | undefined,
): LinkKind | null {
  if (!node) return null;
  if (isSymbolNode(node)) {
    if (portId === null) return null;
    const symbolId = node.data?.symbolId;
    if (!symbolId) return null;
    return getSymbol(symbolId)?.terminals.find((t) => t.id === portId)?.kind ?? 'power';
  }
  if (isJunctionNode(node)) {
    return node.data?.kind ?? 'power';
  }
  return null;
}

// Stored on `data`, NOT on `node.angle` — angle would hide the resize
// adornment. Applied via CSS transform; `node.size` is swapped to match.
export type SymbolOrientation = 0 | 90 | 180 | 270;

export interface SldSymbolNodeData {
  readonly symbolId: string;
  readonly orientation: SymbolOrientation;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

// Length axis — drives the render template and the aspect-lock middleware.
export interface SldWireNodeData {
  readonly orientation: 'horizontal' | 'vertical';
}

// Wire render thickness in px; the junction-overlay dot is drawn centred on
// this centreline. Pinned by the aspect-lock middleware.
export const WIRE_THICKNESS_PX = 16;

export const WIRE_DEFAULT_LENGTH_PX = 64;

// Type guards: narrow a Node to its SLD data contract by the `type`
// discriminant. Prefer these over `node.data as SldXNodeData` — the narrowing
// is tied to the real discriminant, not a blind assertion the compiler trusts.
export function isSymbolNode(node: Node): node is Node<SldSymbolNodeData> {
  return node.type === SLD_SYMBOL_NODE_TYPE;
}

export function isWireNode(node: Node): node is Node<SldWireNodeData> {
  return node.type === SLD_WIRE_NODE_TYPE;
}

export function isJunctionNode(node: Node): node is Node<SldJunctionNodeData> {
  return node.type === SLD_JUNCTION_NODE_TYPE;
}

// World-space centreline of a wire node: its two endpoints and axis. Null for
// any non-wire node or a wire still missing its size. Single source for the
// wire-endpoint math shared by the junctions feature, the connected-component
// BFS, and wire-snap.
export interface WireSegmentGeometry {
  readonly start: Point;
  readonly end: Point;
  readonly horizontal: boolean;
}

export function nodeWireSegment(node: Node): WireSegmentGeometry | null {
  if (!isWireNode(node) || !node.size) return null;
  const horizontal = node.data.orientation === 'horizontal';
  const start: Point = horizontal
    ? { x: node.position.x, y: node.position.y + node.size.height / 2 }
    : { x: node.position.x + node.size.width / 2, y: node.position.y };
  const end: Point = horizontal
    ? { x: node.position.x + node.size.width, y: start.y }
    : { x: start.x, y: node.position.y + node.size.height };
  return { start, end, horizontal };
}
