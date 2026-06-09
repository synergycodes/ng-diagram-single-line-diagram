import type { Edge, Point } from 'ng-diagram';

// Slightly larger than the 10 px visible circle so aim doesn't have to be pixel-perfect.
export const SNAP_TO_DANGLING_PX = 12;

export interface DanglingEndpoint {
  readonly edgeId: string;
  readonly side: 'source' | 'target';
  readonly position: Point;
}

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
