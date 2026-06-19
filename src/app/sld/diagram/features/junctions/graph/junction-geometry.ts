import { type Edge, type Node, type Point, type Port } from 'ng-diagram';
import {
  SLD_JUNCTION_NODE_TYPE,
  SLD_JUNCTION_PORT_IDS,
  SLD_JUNCTION_SIZE_PX,
  edgeKind,
  pickBranchJunctionPortId,
  pickJunctionPortId,
  type LinkKind,
  type SldJunctionNodeData,
  type SldJunctionPortId,
} from '../../../core/geometry/node-types';
import { splitPolylineAt } from '../../../core/geometry/edge-split';
import {
  findDanglingEndpoints,
  SNAP_TO_DANGLING_PX,
  type DanglingEndpoint,
} from './dangling-endpoints';

// Junction geometry + port-selection helpers, plus the geometric searches the
// drop resolver runs over the model. No DI, no model access — inputs are passed
// in (see junction-geometry.spec.ts for the covering tests).

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

// The two manual halves and the three junction ports a parent-edge split
// produces. Pure, so JunctionAttachmentService.splitEdgeAtHit only runs the
// transaction. `branchOtherEnd` is the dropped branch's far end (null when
// unresolved), used to bias the branch onto a free perpendicular port.
export interface EdgeSplitPlan {
  readonly firstHalf: Point[];
  readonly secondHalf: Point[];
  readonly halfASidePort: SldJunctionPortId;
  readonly halfBSidePort: SldJunctionPortId;
  readonly branchSidePort: SldJunctionPortId;
}

export function computeEdgeSplitPlan(
  parentPoints: readonly Point[],
  segmentIndex: number,
  snapPoint: Point,
  branchOtherEnd: Point | null,
): EdgeSplitPlan {
  const centre = snapPoint;
  const { firstHalf, secondHalf } = splitPolylineAt(parentPoints, segmentIndex, snapPoint);

  // Pick ports from each half's neighbour direction (not splitAxis) so a
  // seam-at-bend lands on the right axis. Collision fallback uses splitAxis
  // defaults — rare U-shape case.
  const segStart = parentPoints[segmentIndex];
  const segEnd = parentPoints[segmentIndex + 1];
  const splitAxis: 'horizontal' | 'vertical' =
    Math.abs(segStart.y - segEnd.y) < Math.abs(segStart.x - segEnd.x) ? 'horizontal' : 'vertical';
  const halfANeighbour = firstHalf[firstHalf.length - 2];
  const halfBNeighbour = secondHalf[1];
  let halfASidePort = pickJunctionPortId(centre, halfANeighbour);
  let halfBSidePort = pickJunctionPortId(centre, halfBNeighbour);
  if (halfASidePort === halfBSidePort) {
    halfASidePort = defaultHalfFallback(splitAxis, 'a');
    halfBSidePort = defaultHalfFallback(splitAxis, 'b');
  }

  const branchSidePort = pickBranchPortAvoidingHalves(
    splitAxis,
    centre,
    branchOtherEnd,
    new Set<SldJunctionPortId>([halfASidePort, halfBSidePort]),
  );

  // Slide seam endpoints from `snap` onto the actual port coords (centre ±
  // JUNCTION_SIZE/2). Slide is along the half's last segment axis, so
  // orthogonality is preserved.
  const halfAPortWorld = junctionPortWorld(centre, halfASidePort);
  const halfBPortWorld = junctionPortWorld(centre, halfBSidePort);
  firstHalf[firstHalf.length - 1] = { x: halfAPortWorld.x, y: halfAPortWorld.y };
  secondHalf[0] = { x: halfBPortWorld.x, y: halfBPortWorld.y };

  return { firstHalf, secondHalf, halfASidePort, halfBSidePort, branchSidePort };
}

// Nearest same-kind dangling endpoint within SNAP_TO_DANGLING_PX of `point`, or
// null. Pure over the supplied edges.
export function findNearbyDanglingEndpointAmong(
  edges: readonly Edge[],
  point: Point,
  kind: LinkKind,
): DanglingEndpoint | null {
  const matchingEdges = edges.filter((edge) => edgeKind(edge) === kind);
  const endpoints = findDanglingEndpoints(matchingEdges);
  let bestDistSq = SNAP_TO_DANGLING_PX * SNAP_TO_DANGLING_PX;
  let best: DanglingEndpoint | null = null;
  for (const endpoint of endpoints) {
    const dx = endpoint.position.x - point.x;
    const dy = endpoint.position.y - point.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      best = endpoint;
    }
  }
  return best;
}
