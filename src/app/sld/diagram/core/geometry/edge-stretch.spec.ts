import type { Point } from 'ng-diagram';
import {
  collapseCollinearBends,
  stretchPolyline,
  stretchPolylineWithBendInsertion,
} from './edge-stretch';

describe('stretchPolyline', () => {
  function expectOrthogonal(points: readonly Point[]): void {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const horizontal = Math.abs(a.y - b.y) < 0.5;
      const vertical = Math.abs(a.x - b.x) < 0.5;
      expect(horizontal || vertical)
        .withContext(`segment ${i}: (${a.x},${a.y}) → (${b.x},${b.y})`)
        .toBe(true);
    }
  }

  it('slides the source-adjacent bend when the source moves perpendicular to the first segment', () => {
    // Z-shape: horizontal-vertical-horizontal. Source at (0,0) moves to (0,16).
    // The first segment was horizontal, so the bend at (40,0) should now sit
    // at (40,16) so the new first segment stays horizontal.
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
      { x: 80, y: 100 },
    ];
    const after = stretchPolyline(before, { x: 0, y: 16 }, null);
    expect(after).not.toBeNull();
    expectOrthogonal(after!);
    expect(after![0]).toEqual({ x: 0, y: 16 });
    expect(after![1]).toEqual({ x: 40, y: 16 });
    expect(after![2]).toEqual({ x: 40, y: 100 });
    expect(after![3]).toEqual({ x: 80, y: 100 });
  });

  it('slides the target-adjacent bend when the target moves', () => {
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
      { x: 80, y: 100 },
    ];
    const after = stretchPolyline(before, null, { x: 80, y: 124 });
    expect(after).not.toBeNull();
    expectOrthogonal(after!);
    expect(after![0]).toEqual({ x: 0, y: 0 });
    expect(after![1]).toEqual({ x: 40, y: 0 });
    expect(after![2]).toEqual({ x: 40, y: 124 });
    expect(after![3]).toEqual({ x: 80, y: 124 });
  });

  it('translates the whole route rigidly when both endpoints move by the same delta', () => {
    // Both endpoints carried along by the same delta (e.g. moving a node that
    // owns both ends). Every bend should translate uniformly — shape preserved.
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
      { x: 80, y: 100 },
    ];
    const dx = 32;
    const dy = -16;
    const after = stretchPolyline(
      before,
      { x: before[0].x + dx, y: before[0].y + dy },
      { x: before[before.length - 1].x + dx, y: before[before.length - 1].y + dy },
    );
    expect(after).not.toBeNull();
    for (let i = 0; i < before.length; i++) {
      expect(after![i]).toEqual({ x: before[i].x + dx, y: before[i].y + dy });
    }
  });

  it('returns null when a 2-point straight segment is broken off-axis', () => {
    // Horizontal segment (0,0)→(100,0). Source moves down with target stationary.
    // No interior bend to absorb the perpendicular shift → stretch can't keep
    // it orthogonal. Caller falls back to a full re-route.
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const after = stretchPolyline(before, { x: 0, y: 16 }, null);
    expect(after).toBeNull();
  });

  it('keeps a 2-point segment along its axis when source slides along it', () => {
    // Horizontal segment, source slides along the same horizontal axis — still
    // a straight horizontal line, no re-route needed.
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const after = stretchPolyline(before, { x: 24, y: 0 }, null);
    expect(after).toEqual([
      { x: 24, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('handles vertical first segment correctly', () => {
    // First segment is vertical, source moves horizontally. Bend at (0,40)
    // should now sit at (24,40) so the new first segment stays vertical.
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 80, y: 40 },
    ];
    const after = stretchPolyline(before, { x: 24, y: 0 }, null);
    expect(after).not.toBeNull();
    expectOrthogonal(after!);
    expect(after![0]).toEqual({ x: 24, y: 0 });
    expect(after![1]).toEqual({ x: 24, y: 40 });
    expect(after![2]).toEqual({ x: 80, y: 40 });
  });

  it('returns a clone when nothing moved', () => {
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
    ];
    const after = stretchPolyline(before, null, null);
    expect(after).toEqual(before);
    // Verify it's a clone — mutating the result shouldn't touch the input.
    after![0].x = 999;
    expect(before[0].x).toBe(0);
  });

  it('stretches both ends independently when each endpoint moves by a different delta', () => {
    // Diverging endpoints (different deltas) → no rigid-translation shortcut;
    // each end's adjacent bend slides independently.
    const before: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
      { x: 80, y: 100 },
    ];
    const after = stretchPolyline(before, { x: 0, y: -8 }, { x: 80, y: 116 });
    expect(after).not.toBeNull();
    expectOrthogonal(after!);
    expect(after![0]).toEqual({ x: 0, y: -8 });
    expect(after![1]).toEqual({ x: 40, y: -8 });
    expect(after![2]).toEqual({ x: 40, y: 116 });
    expect(after![3]).toEqual({ x: 80, y: 116 });
  });
});

describe('collapseCollinearBends', () => {
  it('folds a straight pass-through point', () => {
    expect(
      collapseCollinearBends([
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 0, y: 100 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]);
  });

  it('folds a duplicate (zero-length-segment) point', () => {
    expect(
      collapseCollinearBends([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 100 },
        { x: 80, y: 100 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 80, y: 100 },
    ]);
  });

  it('keeps a genuine L corner', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 80, y: 100 },
    ];
    expect(collapseCollinearBends(path)).toEqual(path);
  });

  it('keeps a U-turn (reversal) bend instead of straightening it (regression: reshape lost on overlap)', () => {
    // Same-x doubling back (a collapsed connector): the middle point is
    // collinear but an extremum, so it must survive rather than straighten.
    const uTurn: Point[] = [
      { x: 120, y: 290 },
      { x: 120, y: 64 },
      { x: 120, y: 420 },
    ];
    expect(collapseCollinearBends(uTurn)).toEqual(uTurn);
  });
});

describe('stretchPolylineWithBendInsertion', () => {
  it('inserts an L-bend when a 2-point straight segment is pulled off-axis', () => {
    // Bare stretchPolyline returns null here; the bend-insertion variant keeps
    // the edge routable by adding a corner.
    const after = stretchPolylineWithBendInsertion(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { x: 0, y: 16 },
      null,
    );
    expect(after).toEqual([
      { x: 0, y: 16 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('preserves the reshape as an overlapping U-turn when a moved node aligns two verticals (regression)', () => {
    // Regression: an "n"-shape whose bottom endpoint is dragged until its
    // vertical lands on the other (x=120). The collapsed connector must survive
    // as an overlapping U-turn, not straighten (the old reset bug).
    const nShape: Point[] = [
      { x: 120, y: 290 },
      { x: 120, y: 64 },
      { x: 300, y: 64 },
      { x: 300, y: 420 },
    ];
    const after = stretchPolylineWithBendInsertion(nShape, null, { x: 120, y: 420 });
    expect(after).toEqual([
      { x: 120, y: 290 },
      { x: 120, y: 64 },
      { x: 120, y: 420 },
    ]);
  });
});
