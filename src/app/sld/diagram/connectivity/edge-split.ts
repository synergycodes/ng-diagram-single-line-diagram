import type { Edge, Point } from 'ng-diagram';
import { samePoint, segmentAxis } from '../geometry/orthogonal';

export interface EdgeSplitHit {
  readonly edge: Edge;
  readonly snapPoint: Point;
  readonly segmentIndex: number;
}

// Pick the edge passing closest to `point`, returning a grid-aligned, segment-
// clamped insertion point. Outer endpoints are rejected (would clash with the
// port/anchor); interior bend vertices stay valid. Diagonal segments are skipped.
export function findEdgeSplitHit(
  edges: readonly Edge[],
  point: Point,
  hitTolerancePx: number,
  gridPx: number,
): EdgeSplitHit | null {
  let best: EdgeSplitHit | null = null;
  let bestDist = hitTolerancePx;

  for (const edge of edges) {
    const edgePoints = edge.points;
    if (!edgePoints || edgePoints.length < 2) continue;
    const lastIndex = edgePoints.length - 1;
    for (let i = 0; i < edgePoints.length - 1; i++) {
      const segStart = edgePoints[i];
      const segEnd = edgePoints[i + 1];
      const dist = pointDistToOrthogonalSegment(point, segStart, segEnd);
      if (dist === null || dist > bestDist) continue;
      const snap = snapToOrthogonalSegment(point, segStart, segEnd, gridPx);
      if (!snap) continue;
      // Reject only OUTER endpoints — interior bends stay valid.
      if (i === 0 && samePoint(snap, segStart)) continue;
      if (i + 1 === lastIndex && samePoint(snap, segEnd)) continue;
      bestDist = dist;
      best = { edge, snapPoint: snap, segmentIndex: i };
    }
  }

  return best;
}

// Slice points[] at `snap`; snap point appears in both halves. Collapses any
// zero-length seam segment when snap coincides with an interior bend vertex.
export function splitPolylineAt(
  points: readonly Point[],
  segmentIndex: number,
  snap: Point,
): { firstHalf: Point[]; secondHalf: Point[] } {
  const firstHalf = points.slice(0, segmentIndex + 1).map((point) => ({ x: point.x, y: point.y }));
  firstHalf.push({ x: snap.x, y: snap.y });
  const secondHalf: Point[] = [{ x: snap.x, y: snap.y }];
  for (let i = segmentIndex + 1; i < points.length; i++) {
    secondHalf.push({ x: points[i].x, y: points[i].y });
  }
  if (
    firstHalf.length >= 2 &&
    samePoint(firstHalf[firstHalf.length - 1], firstHalf[firstHalf.length - 2])
  ) {
    firstHalf.splice(firstHalf.length - 2, 1);
  }
  if (secondHalf.length >= 2 && samePoint(secondHalf[0], secondHalf[1])) {
    secondHalf.splice(1, 1);
  }
  return { firstHalf, secondHalf };
}

function pointDistToOrthogonalSegment(p: Point, a: Point, b: Point): number | null {
  const axis = segmentAxis(a, b);
  if (axis === 'horizontal') {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (p.x < minX || p.x > maxX) return null;
    return Math.abs(p.y - a.y);
  }
  if (axis === 'vertical') {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (p.y < minY || p.y > maxY) return null;
    return Math.abs(p.x - a.x);
  }
  return null;
}

function snapToOrthogonalSegment(p: Point, a: Point, b: Point, gridPx: number): Point | null {
  const axis = segmentAxis(a, b);
  if (axis === 'horizontal') {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const snapped = Math.round(p.x / gridPx) * gridPx;
    return { x: clamp(snapped, minX, maxX), y: a.y };
  }
  if (axis === 'vertical') {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const snapped = Math.round(p.y / gridPx) * gridPx;
    return { x: a.x, y: clamp(snapped, minY, maxY) };
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
