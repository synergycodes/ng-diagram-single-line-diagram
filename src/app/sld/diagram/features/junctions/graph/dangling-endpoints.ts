import type { Edge, Point } from 'ng-diagram';

// Dangling endpoints: edge ends not attached to any node (empty id + a free
// world position). Used to render drop indicators and to let a new link snap
// onto an existing loose end instead of stranding two ends at the same spot.

// Snap radius for landing on a dangling end. Slightly larger than the 10 px
// visible circle so aim doesn't have to be pixel-perfect.
export const SNAP_TO_DANGLING_PX = 12;

// One free edge end: which edge, which side, and where it floats in world space.
export interface DanglingEndpoint {
  readonly edgeId: string;
  readonly side: 'source' | 'target';
  readonly position: Point;
}

// Scan edges for ends with an empty node id but a stored position — the loose
// ends a user can still relink or merge onto.
export function findDanglingEndpoints(edges: readonly Edge[]): DanglingEndpoint[] {
  const endpoints: DanglingEndpoint[] = [];
  for (const edge of edges) {
    if (edge.source === '' && edge.sourcePosition) {
      endpoints.push({ edgeId: edge.id, side: 'source', position: edge.sourcePosition });
    }
    if (edge.target === '' && edge.targetPosition) {
      endpoints.push({ edgeId: edge.id, side: 'target', position: edge.targetPosition });
    }
  }
  return endpoints;
}
