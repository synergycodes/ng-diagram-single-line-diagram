import type { Edge, NgDiagramModelService, NgDiagramService, Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from '../../../core/geometry/constants';
import { mintLinkId } from '../../../core/geometry/id-factory';
import {
  edgeKind,
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  type SldLinkEdgeData,
} from '../../../core/geometry/node-types';
import { portWorldPosition } from '../../../core/geometry/port-position';

// Keeps the junction graph honest after edits: a junction must connect 3+
// branches to be meaningful, so this prunes degenerate ones left by deletes or
// relinks. Runs whenever a junction's branch count may have changed.

// Post-mutation junction fixup (delete, relink). By branch count: 0 -> delete
// the orphan; 2 -> merge the halves into one edge and drop the node; 1 or 3+ ->
// leave as-is. Non-junction / missing ids are ignored.
export function reconcileJunction(
  modelService: NgDiagramModelService,
  ngDiagramService: NgDiagramService,
  junctionId: string,
): void {
  if (!junctionId) return;
  const node = modelService.getNodeById(junctionId);
  if (!node || node.type !== SLD_JUNCTION_NODE_TYPE) return;

  const connected = modelService.getConnectedEdges(junctionId);
  if (connected.length === 0) {
    modelService.deleteNodes([junctionId]);
    return;
  }
  if (connected.length === 2) {
    mergeHalves(modelService, ngDiagramService, junctionId, connected[0], connected[1]);
  }
}

// Collapse a 2-branch junction back into a single edge between the two far ends
// and delete the node — undoing an earlier split now that the third branch is
// gone. Batched in one transaction so the model never shows a half-removed state.
function mergeHalves(
  modelService: NgDiagramModelService,
  ngDiagramService: NgDiagramService,
  junctionId: string,
  firstHalf: Edge,
  secondHalf: Edge,
): void {
  const firstOtherEnd =
    firstHalf.source === junctionId
      ? { id: firstHalf.target, port: firstHalf.targetPort, position: firstHalf.targetPosition }
      : { id: firstHalf.source, port: firstHalf.sourcePort, position: firstHalf.sourcePosition };
  const secondOtherEnd =
    secondHalf.source === junctionId
      ? { id: secondHalf.target, port: secondHalf.targetPort, position: secondHalf.targetPosition }
      : { id: secondHalf.source, port: secondHalf.sourcePort, position: secondHalf.sourcePosition };

  // Compose the polyline manually — auto routing can leave quasi-collinear
  // bends within tolerance that surface as ghost handles.
  const srcWorld = endpointResolvedWorld(modelService, firstOtherEnd);
  const tgtWorld = endpointResolvedWorld(modelService, secondOtherEnd);

  // Junction enforces kind-consistency on its branches — pick from either.
  const kind = edgeKind(firstHalf);

  ngDiagramService.transaction(() => {
    modelService.deleteEdges([firstHalf.id, secondHalf.id]);
    modelService.deleteNodes([junctionId]);
    const mergedPoints =
      srcWorld && tgtWorld ? minimalOrthogonalPath(srcWorld, tgtWorld) : undefined;
    modelService.addEdges([
      {
        ...(kind === 'control' ? { type: SLD_CONTROL_LINK_EDGE_TYPE } : {}),
        id: mintLinkId(),
        source: firstOtherEnd.id,
        sourcePort: firstOtherEnd.port,
        sourcePosition: firstOtherEnd.id === '' ? firstOtherEnd.position : undefined,
        target: secondOtherEnd.id,
        targetPort: secondOtherEnd.port,
        targetPosition: secondOtherEnd.id === '' ? secondOtherEnd.position : undefined,
        // 'manual' so the composed polyline isn't re-routed away.
        routingMode: mergedPoints ? 'manual' : 'auto',
        points: mergedPoints,
        data: { kind } satisfies SldLinkEdgeData,
      },
    ]);
  });
}

// World position of a far end: its stored position if dangling, else the live
// port position on the node it connects to.
function endpointResolvedWorld(
  modelService: NgDiagramModelService,
  end: { id: string; port: string | undefined; position: Point | undefined },
): Point | null {
  if (end.id === '') return end.position ?? null;
  if (!end.port) return null;
  const node = modelService.getNodeById(end.id);
  return portWorldPosition(node ?? null, end.port);
}

// 2-point segment for axis-aligned ports, L (vertical-first) for misaligned.
function minimalOrthogonalPath(src: Point, tgt: Point): Point[] {
  const sameX = Math.abs(src.x - tgt.x) < POSITION_TOLERANCE_PX;
  const sameY = Math.abs(src.y - tgt.y) < POSITION_TOLERANCE_PX;
  if (sameX || sameY)
    return [
      { x: src.x, y: src.y },
      { x: tgt.x, y: tgt.y },
    ];
  return [
    { x: src.x, y: src.y },
    { x: src.x, y: tgt.y },
    { x: tgt.x, y: tgt.y },
  ];
}
