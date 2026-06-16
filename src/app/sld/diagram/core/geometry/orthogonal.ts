// Atomic predicates for orthogonal (axis-aligned) geometry: point equality and
// segment-axis classification. Shared so every wire/edge helper agrees on what
// counts as "the same point" and what counts as horizontal vs vertical.
import type { Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from './constants';

// True when two points coincide within tolerance (not strict ===, which float drift breaks).
export function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < POSITION_TOLERANCE_PX && Math.abs(a.y - b.y) < POSITION_TOLERANCE_PX;
}

// Returns null for diagonal or zero-length segments so the caller skips rather than misclassifies them.
export function segmentAxis(a: Point, b: Point): 'horizontal' | 'vertical' | null {
  const horizontal = Math.abs(a.y - b.y) < POSITION_TOLERANCE_PX;
  const vertical = Math.abs(a.x - b.x) < POSITION_TOLERANCE_PX;
  if (horizontal && vertical) return null;
  if (horizontal) return 'horizontal';
  if (vertical) return 'vertical';
  return null;
}
