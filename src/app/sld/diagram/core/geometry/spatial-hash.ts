import type { Point } from 'ng-diagram';

// Shared spatial-hash primitives: bucketed lookups that replace linear scans
// (junction detection/propagation, connectivity BFS, edge reshape). Connection
// geometry is grid-aligned, so rounding groups coincident points (within
// POSITION_TOLERANCE_PX) into one bucket.

// Bucket key for a world point. Pass a discriminator (e.g. link kind) to keep
// separate layers out of the same bucket.
export function pointBucketKey(point: Point, discriminator = ''): string {
  return `${discriminator}|${Math.round(point.x)}:${Math.round(point.y)}`;
}

export interface AxisAlignedSegment {
  readonly horizontal: boolean;
  readonly start: Point;
  readonly end: Point;
}

// Indexes axis-aligned segments by their constant-axis line, so a query point
// tests only segments on its row/column — drops the mid-segment pass to ~O(N).
export class SegmentIndex<S extends AxisAlignedSegment> {
  private readonly horizontalByRow = new Map<number, S[]>();
  private readonly verticalByColumn = new Map<number, S[]>();

  add(segment: S): void {
    const map = segment.horizontal ? this.horizontalByRow : this.verticalByColumn;
    const line = Math.round(segment.horizontal ? segment.start.y : segment.start.x);
    const bucket = map.get(line);
    if (bucket) bucket.push(segment);
    else map.set(line, [segment]);
  }

  // Segments whose line passes through this point's row or column.
  candidates(point: Point): readonly S[] {
    const row = this.horizontalByRow.get(Math.round(point.y));
    const column = this.verticalByColumn.get(Math.round(point.x));
    if (row && column) return [...row, ...column];
    return row ?? column ?? [];
  }
}
