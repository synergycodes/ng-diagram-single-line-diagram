// Junction port reassignment — pure logic for the port-routing middleware.
// Prevents two branches from leaving the junction collinear (overlap).

import type { Edge, Point } from 'ng-diagram';
import {
  pickJunctionPortId,
  SLD_JUNCTION_PORT_IDS,
  type SldJunctionPortId,
  type SldLinkEdgeData,
} from './node-types';

export interface BranchEndpoint {
  readonly edgeId: string;
  readonly side: 'source' | 'target';
  readonly currentPort: SldJunctionPortId;
  readonly otherEndWorld: { x: number; y: number };
  // Parent-halves keep their port; fresh branches yield.
  readonly formerParentId?: string;
}

// Index every junction-incident branch under its junction in one edge pass
// (O(E), not O(junctions x edges)). A junction-to-junction edge registers
// under both ends; a self-loop only on its source side.
export function collectBranchesByJunction(
  junctionIds: ReadonlySet<string>,
  edges: readonly Edge[],
  resolveOtherEnd: (nodeId: string, position: Point | undefined) => Point | null,
): Map<string, BranchEndpoint[]> {
  const byJunction = new Map<string, BranchEndpoint[]>();
  const push = (junctionId: string, branch: BranchEndpoint): void => {
    const list = byJunction.get(junctionId);
    if (list) list.push(branch);
    else byJunction.set(junctionId, [branch]);
  };

  for (const edge of edges) {
    // Skip manual edges — changing the port would orphan the polyline.
    if (edge.routingMode === 'manual' && edge.points && edge.points.length > 0) continue;
    const formerParentId = (edge.data as SldLinkEdgeData | undefined)?.formerParentId;

    if (junctionIds.has(edge.source) && edge.sourcePort) {
      const otherEnd = resolveOtherEnd(edge.target, edge.targetPosition);
      if (otherEnd) {
        push(edge.source, {
          edgeId: edge.id,
          side: 'source',
          currentPort: edge.sourcePort as SldJunctionPortId,
          otherEndWorld: otherEnd,
          formerParentId,
        });
      }
    }
    if (junctionIds.has(edge.target) && edge.targetPort && edge.target !== edge.source) {
      const otherEnd = resolveOtherEnd(edge.source, edge.sourcePosition);
      if (otherEnd) {
        push(edge.target, {
          edgeId: edge.id,
          side: 'target',
          currentPort: edge.targetPort as SldJunctionPortId,
          otherEndWorld: otherEnd,
          formerParentId,
        });
      }
    }
  }

  return byJunction;
}

export interface BranchPortAssignment {
  readonly edgeId: string;
  readonly side: 'source' | 'target';
  readonly port: SldJunctionPortId;
}

// Minimal port-change diff over two passes (then diffed vs. input): (1) decongest
// overcrowded ports — extra non-parent-half branches jump to a free perpendicular
// port; (2) redirect a lone branch whose far end no longer faces its port (its
// node moved across the segment) to the port facing that end, if free. Parent
// halves never move (they define the through-line). Idempotent.
export function reassignJunctionBranches(
  junctionCentre: { x: number; y: number },
  branches: readonly BranchEndpoint[],
): BranchPortAssignment[] {
  const portCounts: Record<SldJunctionPortId, number> = {
    [SLD_JUNCTION_PORT_IDS.top]: 0,
    [SLD_JUNCTION_PORT_IDS.right]: 0,
    [SLD_JUNCTION_PORT_IDS.bottom]: 0,
    [SLD_JUNCTION_PORT_IDS.left]: 0,
  };
  // Working port per branch, seeded from its current port and mutated in place
  // by both passes; the change list is the final diff vs. `currentPort`.
  const assigned: SldJunctionPortId[] = branches.map((b) => b.currentPort);
  for (const port of assigned) portCounts[port]++;

  const allPorts: readonly SldJunctionPortId[] = [
    SLD_JUNCTION_PORT_IDS.top,
    SLD_JUNCTION_PORT_IDS.right,
    SLD_JUNCTION_PORT_IDS.bottom,
    SLD_JUNCTION_PORT_IDS.left,
  ];

  // PASS 1 — decongest overcrowded ports.
  for (const port of allPorts) {
    if (portCounts[port] <= 1) continue;

    const onPort = branches.map((_, i) => i).filter((i) => assigned[i] === port);
    const movable = onPort.filter((i) => branches[i].formerParentId === undefined);
    if (movable.length === 0) continue;

    const hasParentHalf = onPort.length > movable.length;
    const toReassign = hasParentHalf ? movable : movable.slice(1);

    for (const i of toReassign) {
      const primary = pickCrossAxisPort(port, junctionCentre, branches[i].otherEndWorld);
      const alt = oppositePort(primary);
      const target = portCounts[primary] === 0 ? primary : portCounts[alt] === 0 ? alt : null;
      if (target === null) continue;

      portCounts[port]--;
      portCounts[target]++;
      assigned[i] = target;
    }
  }

  // PASS 2 — redirect a lone movable branch onto the port facing its far end.
  // Only when it's alone (decongestion owns crowded ports) and that port is free
  // (never displace another branch or a parent half).
  for (let i = 0; i < branches.length; i++) {
    if (branches[i].formerParentId !== undefined) continue;
    const current = assigned[i];
    if (portCounts[current] !== 1) continue;
    const desired = pickJunctionPortId(junctionCentre, branches[i].otherEndWorld);
    if (desired === current || portCounts[desired] !== 0) continue;
    portCounts[current]--;
    portCounts[desired]++;
    assigned[i] = desired;
  }

  const changes: BranchPortAssignment[] = [];
  for (let i = 0; i < branches.length; i++) {
    if (assigned[i] !== branches[i].currentPort) {
      changes.push({ edgeId: branches[i].edgeId, side: branches[i].side, port: assigned[i] });
    }
  }
  return changes;
}

// Pick the perpendicular port a moved branch should jump to: 90° off the
// overcrowded side, on whichever of the two cross-axis sides faces the branch's
// other end. Keeps the branch leaving the junction in roughly its own direction.
function pickCrossAxisPort(
  overcrowdedPort: SldJunctionPortId,
  centre: { x: number; y: number },
  otherEnd: { x: number; y: number },
): SldJunctionPortId {
  if (
    overcrowdedPort === SLD_JUNCTION_PORT_IDS.left ||
    overcrowdedPort === SLD_JUNCTION_PORT_IDS.right
  ) {
    return otherEnd.y >= centre.y ? SLD_JUNCTION_PORT_IDS.bottom : SLD_JUNCTION_PORT_IDS.top;
  }
  return otherEnd.x >= centre.x ? SLD_JUNCTION_PORT_IDS.right : SLD_JUNCTION_PORT_IDS.left;
}

// The port across the junction — the fallback when `pickCrossAxisPort`'s
// preferred side is already taken.
function oppositePort(p: SldJunctionPortId): SldJunctionPortId {
  switch (p) {
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
