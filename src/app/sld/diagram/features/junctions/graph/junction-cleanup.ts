import type { Edge, NgDiagramModelService, NgDiagramService, Node, Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from '../../../core/geometry/constants';
import { collapseCollinearBends } from '../../../core/geometry/edge-stretch';
import { mintLinkId } from '../../../core/geometry/id-factory';
import {
  edgeKind,
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  type SldLinkEdgeData,
} from '../../../core/geometry/node-types';
import { portWorldPosition } from '../../../core/geometry/port-position';

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

  const srcWorld = endpointResolvedWorld(modelService, firstOtherEnd);
  const tgtWorld = endpointResolvedWorld(modelService, secondOtherEnd);

  // Junction enforces kind-consistency on its branches — pick from either.
  const kind = edgeKind(firstHalf);

  const junction = modelService.getNodeById(junctionId);
  const mergedPoints =
    composeRouteThroughJunction(junction, firstHalf, secondHalf, junctionId, srcWorld, tgtWorld) ??
    (srcWorld && tgtWorld ? minimalOrthogonalPath(srcWorld, tgtWorld) : undefined);

  ngDiagramService.transaction(() => {
    modelService.deleteEdges([firstHalf.id, secondHalf.id]);
    modelService.deleteNodes([junctionId]);
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
        // 'manual' so the composed route isn't re-routed away.
        routingMode: mergedPoints ? 'manual' : 'auto',
        points: mergedPoints,
        data: { kind } satisfies SldLinkEdgeData,
      },
    ]);
  });
}

// Rebuild the pre-split route from the two surviving halves, replacing their
// per-side junction ports with the single centre — the inverse of the split.
// Null when a half has no route to compose from.
function composeRouteThroughJunction(
  junction: Node | null,
  firstHalf: Edge,
  secondHalf: Edge,
  junctionId: string,
  srcWorld: Point | null,
  tgtWorld: Point | null,
): Point[] | null {
  if (!junction?.size) return null;
  if (!firstHalf.points || firstHalf.points.length < 2) return null;
  if (!secondHalf.points || secondHalf.points.length < 2) return null;

  const centre: Point = {
    x: junction.position.x + junction.size.width / 2,
    y: junction.position.y + junction.size.height / 2,
  };

  const intoJunction = orientHalf(firstHalf, junctionId, 'junctionLast');
  const outOfJunction = orientHalf(secondHalf, junctionId, 'junctionFirst');
  const merged = [...intoJunction.slice(0, -1), centre, ...outOfJunction.slice(1)];

  if (srcWorld) merged[0] = { x: srcWorld.x, y: srcWorld.y };
  if (tgtWorld) merged[merged.length - 1] = { x: tgtWorld.x, y: tgtWorld.y };

  return collapseCollinearBends(merged);
}

// A half's points run source -> target; return a copy ordered so the junction
// end sits where the caller wants it.
function orientHalf(
  half: Edge,
  junctionId: string,
  junctionEnd: 'junctionFirst' | 'junctionLast',
): Point[] {
  const points = half.points!.map((point) => ({ x: point.x, y: point.y }));
  const junctionIsSource = half.source === junctionId;
  const wantJunctionLast = junctionEnd === 'junctionLast';
  if (junctionIsSource === wantJunctionLast) points.reverse();
  return points;
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
