import type { NgDiagramModelService, Point } from 'ng-diagram';
import { portWorldPosition } from '../geometry/port-position';
import { stretchPolylineWithBendInsertion } from './edge-stretch';

// Re-anchor manual edges to live ports after a node move. Skips edges not
// incident to `movedNodeIds` before the per-edge probe (O(incident), not
// O(all)); the set must include the Alt-drag group. Auto edges are re-routed
// by ng-diagram's orthogonal router.
export function applyEdgeStretchOnSelectionMoved(
  modelService: NgDiagramModelService,
  movedNodeIds: ReadonlySet<string>,
): void {
  const patches: { id: string; points: Point[] }[] = [];
  for (const edge of modelService.edges()) {
    if (edge.routingMode !== 'manual') continue;
    if (!edge.points || edge.points.length < 2) continue;
    // Skip before the getNodeById + portWorldPosition probe below.
    if (!movedNodeIds.has(edge.source) && !movedNodeIds.has(edge.target)) continue;

    const liveSource = liveEndpointWorld(
      modelService,
      edge.source,
      edge.sourcePort,
      edge.sourcePosition,
    );
    const liveTarget = liveEndpointWorld(
      modelService,
      edge.target,
      edge.targetPort,
      edge.targetPosition,
    );
    const oldSource = edge.points[0];
    const oldTarget = edge.points[edge.points.length - 1];

    const sourceDrifted =
      !!liveSource &&
      (Math.abs(liveSource.x - oldSource.x) > 0.5 || Math.abs(liveSource.y - oldSource.y) > 0.5);
    const targetDrifted =
      !!liveTarget &&
      (Math.abs(liveTarget.x - oldTarget.x) > 0.5 || Math.abs(liveTarget.y - oldTarget.y) > 0.5);
    if (!sourceDrifted && !targetDrifted) continue;

    const stretched = stretchPolylineWithBendInsertion(
      edge.points,
      sourceDrifted ? liveSource : null,
      targetDrifted ? liveTarget : null,
    );
    if (stretched) {
      patches.push({ id: edge.id, points: stretched });
    } else {
      // Can't stay orthogonal: keep the edge manual and re-anchor the drifted
      // endpoint(s) rather than discarding the reshape by flipping to auto.
      const kept = edge.points.map((p) => ({ x: p.x, y: p.y }));
      if (sourceDrifted && liveSource) kept[0] = { x: liveSource.x, y: liveSource.y };
      if (targetDrifted && liveTarget) kept[kept.length - 1] = { x: liveTarget.x, y: liveTarget.y };
      patches.push({ id: edge.id, points: kept });
    }
  }
  if (patches.length > 0) {
    modelService.updateEdges(patches);
  }
}

// Returns null when the port isn't measured yet (transient mount state).
function liveEndpointWorld(
  modelService: NgDiagramModelService,
  nodeId: string,
  portId: string | undefined,
  fallback: Point | undefined,
): Point | null {
  if (nodeId && portId) {
    const node = modelService.getNodeById(nodeId);
    return portWorldPosition(node ?? null, portId);
  }
  return fallback ? { x: fallback.x, y: fallback.y } : null;
}
