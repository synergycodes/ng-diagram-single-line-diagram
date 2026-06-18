import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, type Edge, type Point } from 'ng-diagram';
import { GRID } from '../../core/geometry/constants';
import { SLD_JUNCTION_NODE_TYPE } from '../../core/geometry/node-types';
import { portWorldPosition } from '../../core/geometry/port-position';
import {
  reshapeAnchoredSegment,
  type ReshapeDragContext,
  type ReshapeEndpointKind,
  type ReshapeExtension,
} from '../edge-reshape';
import {
  findCollinearPartnerSegment,
  junctionEndDelta,
  sharesFormerParent,
} from './graph/junction-propagation';

// Baseline captured at gesture start so propagation projects against a fixed
// reference instead of compounding the drag delta tick-over-tick.
interface PropagationSnapshot {
  readonly junctionId: string;
  readonly initialJunctionPosition: Point;
  readonly partnerEdgeId: string | null;
  readonly partnerInitialPoints: readonly Point[] | null;
  readonly partnerSegmentIndex: number | null;
  readonly partnerJunctionEnd: 'source' | 'target' | null;
}

/**
 * Teaches edge-reshape about junctions by implementing ReshapeExtension. It
 * supplies what the reshape overlay doesn't model: that a junction node is a
 * *free* end, and that dragging a segment into a junction should drag the
 * junction (and the collinear partner half of a former edge split) along with
 * it, as if the wire had never been split.
 *
 * Provided to the diagram via EDGE_RESHAPE_EXTENSION.
 */
@Injectable()
export class JunctionReshapeExtension implements ReshapeExtension<PropagationSnapshot> {
  private readonly modelService = inject(NgDiagramModelService);

  // A junction node is a free end (moves with the segment); a connected
  // non-junction node is anchored (a port); an empty id is dangling.
  classifyEndpoint(nodeId: string): ReshapeEndpointKind {
    if (!nodeId) return 'dangling';
    const node = this.modelService.getNodeById(nodeId);
    return node?.type === SLD_JUNCTION_NODE_TYPE ? 'free' : 'anchored';
  }

  // Resolve the junction + collinear partner half (same `formerParentId`, same
  // axis/coord) so propagation has a stable baseline.
  snapshot(edge: Edge, ctx: ReshapeDragContext): PropagationSnapshot | null {
    if (!ctx.propagateToFreeEnd || !edge.points) return null;
    const junctionId = ctx.propagateToFreeEnd === 'source' ? edge.source : edge.target;
    const junction = this.modelService.getNodeById(junctionId);
    if (!junction || junction.type !== SLD_JUNCTION_NODE_TYPE) return null;
    const initialJunctionPosition: Point = {
      x: junction.position.x,
      y: junction.position.y,
    };

    const noPartner: PropagationSnapshot = {
      junctionId,
      initialJunctionPosition,
      partnerEdgeId: null,
      partnerInitialPoints: null,
      partnerSegmentIndex: null,
      partnerJunctionEnd: null,
    };

    // Both halves must share `formerParentId` — independent branches at the
    // same junction aren't propagation partners.
    const candidatePartner = this.modelService
      .getConnectedEdges(junctionId)
      .find((candidate) => candidate.id !== edge.id && sharesFormerParent(edge, candidate));
    if (!candidatePartner) return noPartner;

    const collinear = findCollinearPartnerSegment({
      edge,
      partner: candidatePartner,
      junctionId,
      draggedAxis: ctx.axis,
      draggedSegmentIndex: ctx.segmentIndex,
    });
    if (!collinear) return noPartner;

    return {
      junctionId,
      initialJunctionPosition,
      partnerEdgeId: candidatePartner.id,
      partnerInitialPoints: candidatePartner.points!.map((p) => ({ x: p.x, y: p.y })),
      partnerSegmentIndex: collinear.partnerSegmentIndex,
      partnerJunctionEnd: collinear.partnerJunctionEnd,
    };
  }

  // Move the junction by the segment's delta and apply the same delta to the
  // partner half — reshape continues across the junction as if the wire were
  // still unsplit.
  apply(snap: PropagationSnapshot, ctx: ReshapeDragContext, newPoints: readonly Point[]): void {
    if (!ctx.propagateToFreeEnd) return;

    const { dx: deltaX, dy: deltaY } = junctionEndDelta(
      ctx.initialPoints,
      newPoints,
      ctx.propagateToFreeEnd,
    );

    this.modelService.updateNode(snap.junctionId, {
      position: {
        x: snap.initialJunctionPosition.x + deltaX,
        y: snap.initialJunctionPosition.y + deltaY,
      },
    });

    // Other manual branches on the junction have frozen `points[]` — flip them
    // to 'auto' so the router re-anchors to the moved port.
    const branchesToReset = this.modelService
      .getConnectedEdges(snap.junctionId)
      .filter(
        (branch) =>
          branch.id !== ctx.edgeId &&
          branch.id !== snap.partnerEdgeId &&
          branch.routingMode === 'manual',
      )
      .map((branch) => ({ id: branch.id, routingMode: 'auto' as const }));
    if (branchesToReset.length > 0) {
      this.modelService.updateEdges(branchesToReset);
    }

    if (!snap.partnerEdgeId || !snap.partnerInitialPoints || snap.partnerSegmentIndex === null) {
      return;
    }
    const partnerAnchorPortAtSource = snap.partnerJunctionEnd === 'target';
    const partnerAnchorPortAtTarget = snap.partnerJunctionEnd === 'source';
    const newPartnerPoints = reshapeAnchoredSegment(
      snap.partnerInitialPoints,
      snap.partnerSegmentIndex,
      ctx.axis,
      deltaX,
      deltaY,
      GRID,
      partnerAnchorPortAtSource,
      partnerAnchorPortAtTarget,
    );
    const partnerAnchorSide: 'source' | 'target' =
      snap.partnerJunctionEnd === 'source' ? 'target' : 'source';
    this.anchorEndpointToPort(newPartnerPoints, snap.partnerEdgeId, partnerAnchorSide);
    this.modelService.updateEdge(snap.partnerEdgeId, {
      points: newPartnerPoints,
      routingMode: 'manual',
    });
  }

  // Replace the partner's far end vertex with the live port world position.
  private anchorEndpointToPort(
    points: { x: number; y: number }[],
    edgeId: string,
    side: 'source' | 'target',
  ): void {
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return;
    const nodeId = side === 'source' ? edge.source : edge.target;
    const portId = side === 'source' ? edge.sourcePort : edge.targetPort;
    if (!nodeId || !portId) return;
    const node = this.modelService.getNodeById(nodeId);
    const anchor = portWorldPosition(node, portId);
    if (!anchor) return;
    const idx = side === 'source' ? 0 : points.length - 1;
    points[idx] = anchor;
  }
}
