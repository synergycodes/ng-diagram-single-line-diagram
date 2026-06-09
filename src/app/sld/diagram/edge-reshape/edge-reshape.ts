import type { Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from '../geometry/constants';

export type EndpointKind = 'port' | 'junction' | 'dangling';

export interface ReshapeSegment {
  readonly segmentIndex: number;
  readonly midpoint: Point;
  readonly axis: 'horizontal' | 'vertical';
  readonly propagateToJunction: 'source' | 'target' | null;
  readonly anchorPortAtSource: boolean;
  readonly anchorPortAtTarget: boolean;
}

// Emits one handle per orthogonal segment; degenerate (diagonal/zero-length) segments are skipped.
export function findReshapeableSegments(
  points: readonly Point[] | undefined,
  sourceKind: EndpointKind,
  targetKind: EndpointKind,
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
    const propagateToJunction: 'source' | 'target' | null =
      isFirst && sourceKind === 'junction'
        ? 'source'
        : isLast && targetKind === 'junction'
          ? 'target'
          : null;
    segments.push({
      segmentIndex: i,
      midpoint: { x: (segStart.x + segEnd.x) / 2, y: (segStart.y + segEnd.y) / 2 },
      axis: horizontal ? 'horizontal' : 'vertical',
      propagateToJunction,
      anchorPortAtSource: isFirst && sourceKind === 'port',
      anchorPortAtTarget: isLast && targetKind === 'port',
    });
  }
  return segments;
}

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
