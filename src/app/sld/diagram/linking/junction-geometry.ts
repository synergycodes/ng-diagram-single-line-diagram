import { NgDiagramModelService, type Edge, type Node, type Point, type Port } from 'ng-diagram';
import { endpointWorldPosition } from '../connectivity/junction-cleanup';
import {
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  SLD_JUNCTION_PORT_IDS,
  SLD_JUNCTION_SIZE_PX,
  pickBranchJunctionPortId,
  type LinkKind,
  type SldJunctionNodeData,
  type SldJunctionPortId,
} from '../geometry/node-types';

// Pure geometry + port-selection helpers for JunctionTopologyService. Extracted
// so the service holds only the atomic graph ops and these stay unit-testable in
// isolation (see junction-geometry.spec.ts).

export function junctionWorldCentre(junction: Node): Point {
  const size = junction.size ?? {
    width: SLD_JUNCTION_SIZE_PX,
    height: SLD_JUNCTION_SIZE_PX,
  };
  return {
    x: junction.position.x + size.width / 2,
    y: junction.position.y + size.height / 2,
  };
}

export function junctionNodeAt(world: Point, id: string, kind: LinkKind) {
  const half = SLD_JUNCTION_SIZE_PX / 2;
  // Omit `kind` for power so legacy junctions keep the same on-disk shape.
  const data: SldJunctionNodeData = kind === 'power' ? {} : { kind };
  return {
    id,
    type: SLD_JUNCTION_NODE_TYPE,
    position: { x: world.x - half, y: world.y - half },
    size: { width: SLD_JUNCTION_SIZE_PX, height: SLD_JUNCTION_SIZE_PX },
    autoSize: false,
    resizable: false,
    rotatable: false,
    data,
    // Seed the four ports so a manual split-half anchoring here resolves on
    // frame 1. ng-diagram skips its port-init wait for manual edges, so without
    // this it logs "Invalid edge coordinates" until the junction is DOM-measured.
    // Positions match junctionPortWorld; the re-measure lands on the same spots.
    measuredPorts: junctionMeasuredPorts(id),
  } as const;
}

// Geometric port positions for a junction node (size SLD_JUNCTION_SIZE_PX, ports
// at the cardinal edge midpoints). Size 0 so getPortPosition returns the exact
// edge point, matching junctionPortWorld.
function junctionMeasuredPorts(nodeId: string): Port[] {
  const half = SLD_JUNCTION_SIZE_PX / 2;
  const full = SLD_JUNCTION_SIZE_PX;
  return [
    {
      id: SLD_JUNCTION_PORT_IDS.top,
      nodeId,
      type: 'both',
      side: 'top',
      position: { x: half, y: 0 },
      size: { width: 0, height: 0 },
    },
    {
      id: SLD_JUNCTION_PORT_IDS.right,
      nodeId,
      type: 'both',
      side: 'right',
      position: { x: full, y: half },
      size: { width: 0, height: 0 },
    },
    {
      id: SLD_JUNCTION_PORT_IDS.bottom,
      nodeId,
      type: 'both',
      side: 'bottom',
      position: { x: half, y: full },
      size: { width: 0, height: 0 },
    },
    {
      id: SLD_JUNCTION_PORT_IDS.left,
      nodeId,
      type: 'both',
      side: 'left',
      position: { x: 0, y: half },
      size: { width: 0, height: 0 },
    },
  ];
}

// Control edges carry the custom edge type so ng-diagram renders dashed.
export function edgeShape(kind: LinkKind): { type?: string } {
  return kind === 'control' ? { type: SLD_CONTROL_LINK_EDGE_TYPE } : {};
}

export function defaultHalfFallback(
  splitAxis: 'horizontal' | 'vertical',
  half: 'a' | 'b',
): SldJunctionPortId {
  if (splitAxis === 'horizontal') {
    return half === 'a' ? SLD_JUNCTION_PORT_IDS.left : SLD_JUNCTION_PORT_IDS.right;
  }
  return half === 'a' ? SLD_JUNCTION_PORT_IDS.top : SLD_JUNCTION_PORT_IDS.bottom;
}

function defaultBranchFallback(splitAxis: 'horizontal' | 'vertical'): SldJunctionPortId {
  return splitAxis === 'horizontal' ? SLD_JUNCTION_PORT_IDS.bottom : SLD_JUNCTION_PORT_IDS.right;
}

// Branch port perpendicular to splitAxis, skipping any port a half took. The
// opposite perpendicular is always free in current topology; the full scan is
// defensive. `branchOtherEnd` is null only for a degenerate edge with no
// resolvable far end, which is what `defaultBranchFallback` covers.
export function pickBranchPortAvoidingHalves(
  splitAxis: 'horizontal' | 'vertical',
  centre: Point,
  branchOtherEnd: Point | null,
  taken: ReadonlySet<SldJunctionPortId>,
): SldJunctionPortId {
  const preferred = branchOtherEnd
    ? pickBranchJunctionPortId(splitAxis, centre, branchOtherEnd)
    : defaultBranchFallback(splitAxis);
  if (!taken.has(preferred)) return preferred;
  const opposite = oppositePort(preferred);
  if (!taken.has(opposite)) return opposite;
  for (const port of [
    SLD_JUNCTION_PORT_IDS.top,
    SLD_JUNCTION_PORT_IDS.right,
    SLD_JUNCTION_PORT_IDS.bottom,
    SLD_JUNCTION_PORT_IDS.left,
  ]) {
    if (!taken.has(port)) return port;
  }
  return preferred;
}

function oppositePort(port: SldJunctionPortId): SldJunctionPortId {
  switch (port) {
    case SLD_JUNCTION_PORT_IDS.top:
      return SLD_JUNCTION_PORT_IDS.bottom;
    case SLD_JUNCTION_PORT_IDS.bottom:
      return SLD_JUNCTION_PORT_IDS.top;
    case SLD_JUNCTION_PORT_IDS.left:
      return SLD_JUNCTION_PORT_IDS.right;
    case SLD_JUNCTION_PORT_IDS.right:
      return SLD_JUNCTION_PORT_IDS.left;
  }
}

// Centre offset by half the junction size along the port's axis.
export function junctionPortWorld(centre: Point, port: SldJunctionPortId): Point {
  const half = SLD_JUNCTION_SIZE_PX / 2;
  switch (port) {
    case SLD_JUNCTION_PORT_IDS.top:
      return { x: centre.x, y: centre.y - half };
    case SLD_JUNCTION_PORT_IDS.right:
      return { x: centre.x + half, y: centre.y };
    case SLD_JUNCTION_PORT_IDS.bottom:
      return { x: centre.x, y: centre.y + half };
    case SLD_JUNCTION_PORT_IDS.left:
      return { x: centre.x - half, y: centre.y };
  }
}

export function otherEndWorld(
  modelService: NgDiagramModelService,
  edge: Edge,
  side: 'source' | 'target',
): Point | null {
  return side === 'target'
    ? endpointWorldPosition(modelService, edge.source, edge.sourcePosition)
    : endpointWorldPosition(modelService, edge.target, edge.targetPosition);
}
