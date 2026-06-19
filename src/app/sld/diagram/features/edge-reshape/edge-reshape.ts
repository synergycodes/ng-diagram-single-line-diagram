import type { Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from '../../core/geometry/constants';

// How an edge end behaves under reshape. The overlay maps every endpoint onto
// one of these kinds; what an endpoint actually is (a port, a junction, …) is
// the consumer's concern, not this file's:
//   'anchored' — a fixed point that must stay put (e.g. a port); end segments
//                grow an L-bend instead of dragging the end.
//   'free'     — a point that may move with the dragged segment (e.g. a node);
//                what happens to whatever it's attached to is delegated to a
//                ReshapeExtension (see reshape-extension.ts).
//   'dangling' — a loose end with nothing to anchor or move.
// A consumer maps its own node types onto these kinds (see ReshapeExtension).
export type ReshapeEndpointKind = 'anchored' | 'free' | 'dangling';

// One draggable segment of a selected edge: where its handle sits and how its
// ends behave when dragged. Produced by findReshapeableSegments per orthogonal segment.
export interface ReshapeSegment {
  readonly segmentIndex: number;
  readonly midpoint: Point;
  readonly axis: 'horizontal' | 'vertical';
  // The end ('source'/'target') that sits on a free point dragged with this
  // segment, or null. A ReshapeExtension decides what to do about it.
  readonly propagateToFreeEnd: 'source' | 'target' | null;
  // True when this end-segment touches an anchored port: drag grows an L-bend
  // off the port instead of dragging the port itself (see reshapeAnchoredSegment).
  readonly anchorPortAtSource: boolean;
  readonly anchorPortAtTarget: boolean;
}

// Degenerate (diagonal/zero-length) segments are skipped.
export function findReshapeableSegments(
  points: readonly Point[] | undefined,
  sourceKind: ReshapeEndpointKind,
  targetKind: ReshapeEndpointKind,
): ReshapeSegment[] {
  const segments: ReshapeSegment[] = [];
  if (!points || points.length < 2) return segments;
  const lastSegmentIndex = points.length - 2;
  for (let i = 0; i <= lastSegmentIndex; i++) {
    const segStart = points[i];
    const segEnd = points[i + 1];
    const horizontal = Math.abs(segStart.y - segEnd.y) < POSITION_TOLERANCE_PX;
    const vertical = Math.abs(segStart.x - segEnd.x) < POSITION_TOLERANCE_PX;
    if (horizontal === vertical) continue;
    const isFirst = i === 0;
    const isLast = i === lastSegmentIndex;
    const propagateToFreeEnd: 'source' | 'target' | null =
      isFirst && sourceKind === 'free'
        ? 'source'
        : isLast && targetKind === 'free'
          ? 'target'
          : null;
    segments.push({
      segmentIndex: i,
      midpoint: { x: (segStart.x + segEnd.x) / 2, y: (segStart.y + segEnd.y) / 2 },
      axis: horizontal ? 'horizontal' : 'vertical',
      propagateToFreeEnd,
      anchorPortAtSource: isFirst && sourceKind === 'anchored',
      anchorPortAtTarget: isLast && targetKind === 'anchored',
    });
  }
  return segments;
}

// Slide one segment perpendicular to its axis, snapping to the grid. Both of the
// segment's vertices move together so the segment stays straight; neighbours are
// left untouched (anchoring / orthogonalizing happens in the callers).
export function reshapeSegment(
  points: readonly Point[],
  segmentIndex: number,
  axis: 'horizontal' | 'vertical',
  dxWorld: number,
  dyWorld: number,
  gridPx: number,
): Point[] {
  const result = points.map((p) => ({ ...p }));
  const segStart = result[segmentIndex];
  const segEnd = result[segmentIndex + 1];
  if (axis === 'horizontal') {
    const target = segStart.y + dyWorld;
    const snapped = Math.round(target / gridPx) * gridPx;
    segStart.y = snapped;
    segEnd.y = snapped;
  } else {
    const target = segStart.x + dxWorld;
    const snapped = Math.round(target / gridPx) * gridPx;
    segStart.x = snapped;
    segEnd.x = snapped;
  }
  return result;
}

// Reshape with optional L-bend insertion at port-anchored ends so the port stays put.
export function reshapeAnchoredSegment(
  initialPoints: readonly Point[],
  segmentIndex: number,
  axis: 'horizontal' | 'vertical',
  dxWorld: number,
  dyWorld: number,
  gridPx: number,
  anchorSource: boolean,
  anchorTarget: boolean,
): Point[] {
  const shifted = reshapeSegment(initialPoints, segmentIndex, axis, dxWorld, dyWorld, gridPx);
  const lastIndex = shifted.length - 1;
  const willAnchorSource = anchorSource && segmentIndex === 0;
  const willAnchorTarget = anchorTarget && segmentIndex + 1 === lastIndex;
  if (!willAnchorSource && !willAnchorTarget) return shifted;

  let result: Point[] = shifted;

  // Process target-end first so the source-end splice doesn't shift indices.
  if (willAnchorTarget) {
    const origTarget = initialPoints[lastIndex];
    const newPerp = axis === 'horizontal' ? shifted[lastIndex].y : shifted[lastIndex].x;
    const elbow: Point =
      axis === 'horizontal' ? { x: origTarget.x, y: newPerp } : { x: newPerp, y: origTarget.y };
    result = [...result.slice(0, lastIndex), elbow, { x: origTarget.x, y: origTarget.y }];
  }

  if (willAnchorSource) {
    const origSource = initialPoints[0];
    const newPerp = axis === 'horizontal' ? shifted[0].y : shifted[0].x;
    const elbow: Point =
      axis === 'horizontal' ? { x: origSource.x, y: newPerp } : { x: newPerp, y: origSource.y };
    result = [{ x: origSource.x, y: origSource.y }, elbow, ...result.slice(1)];
  }

  return result;
}
