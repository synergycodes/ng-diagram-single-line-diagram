import type { Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from '../../../core/geometry/constants';
import { type SldLinkEdgeData } from '../../../core/geometry/node-types';
import { segmentAxis } from '../../../core/geometry/orthogonal';

// Pure decision helpers for JunctionReshapeExtension: when a segment is dragged
// into a junction, work out whether the junction's other half-edge (from the
// same former split) is collinear and should move along, and by how much. No
// model access — kept side-effect-free so the extension stays testable.

// Which end of the partner edge sits on the junction, and which of its segments
// is the collinear one to drag.
export interface CollinearPartnerInfo {
  readonly partnerJunctionEnd: 'source' | 'target';
  readonly partnerSegmentIndex: number;
}

// Minimal edge shape these helpers need — lets tests pass plain objects instead
// of full ng-diagram edges.
export interface EdgeLike {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly points?: readonly Point[];
}

export interface PartnerEvaluationArgs {
  readonly edge: EdgeLike;
  readonly partner: EdgeLike;
  readonly junctionId: string;
  readonly draggedAxis: 'horizontal' | 'vertical';
  readonly draggedSegmentIndex: number;
}

// The partner's segment when its junction-adjacent segment is collinear with
// the dragged one (same axis + fixed coord within tolerance), else null.
export function findCollinearPartnerSegment(
  args: PartnerEvaluationArgs,
): CollinearPartnerInfo | null {
  const { edge, partner, junctionId, draggedAxis, draggedSegmentIndex } = args;
  if (!partner.points || partner.points.length < 2) return null;
  if (!edge.points || edge.points.length < 2) return null;

  const partnerJunctionEnd: 'source' | 'target' =
    partner.source === junctionId ? 'source' : 'target';
  const partnerSegmentIndex = partnerJunctionEnd === 'source' ? 0 : partner.points.length - 2;

  const partnerSegStart = partner.points[partnerSegmentIndex];
  const partnerSegEnd = partner.points[partnerSegmentIndex + 1];
  const partnerAxis = segmentAxis(partnerSegStart, partnerSegEnd);
  if (partnerAxis === null) return null;
  if (partnerAxis !== draggedAxis) return null;

  const draggedSeg = edge.points[draggedSegmentIndex];
  const draggedFixedCoord = draggedAxis === 'horizontal' ? draggedSeg.y : draggedSeg.x;
  const partnerFixedCoord = partnerAxis === 'horizontal' ? partnerSegStart.y : partnerSegStart.x;
  if (Math.abs(draggedFixedCoord - partnerFixedCoord) > POSITION_TOLERANCE_PX) {
    return null;
  }

  return { partnerJunctionEnd, partnerSegmentIndex };
}

// False when either edge lacks a formerParentId — independent branches must
// not propagate as a half pair.
export function sharesFormerParent(a: { data?: unknown }, b: { data?: unknown }): boolean {
  const aFormerParent = (a.data as SldLinkEdgeData | undefined)?.formerParentId;
  const bFormerParent = (b.data as SldLinkEdgeData | undefined)?.formerParentId;
  return !!aFormerParent && aFormerParent === bFormerParent;
}

// Reads the junction-side endpoint (not the segment-start vertex) so the delta
// stays correct when reshapeAnchoredSegment inserts an L-bend.
export function junctionEndDelta(
  initialPoints: readonly Point[],
  newPoints: readonly Point[],
  propagateToJunction: 'source' | 'target',
): { dx: number; dy: number } {
  const initIdx = propagateToJunction === 'source' ? 0 : initialPoints.length - 1;
  const newIdx = propagateToJunction === 'source' ? 0 : newPoints.length - 1;
  return {
    dx: newPoints[newIdx].x - initialPoints[initIdx].x,
    dy: newPoints[newIdx].y - initialPoints[initIdx].y,
  };
}
