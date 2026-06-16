import type { Edge } from 'ng-diagram';
import { findEdgeSplitHit, splitPolylineAt } from './edge-split';

function makeEdge(id: string, points: { x: number; y: number }[]): Edge {
  return {
    id,
    source: 'a',
    target: 'b',
    data: {},
    points,
  };
}

describe('findEdgeSplitHit', () => {
  const GRID = 8;
  const TOL = 8;

  it('hits a horizontal segment and snaps X to grid', () => {
    const edges = [
      makeEdge('e1', [
        { x: 0, y: 40 },
        { x: 80, y: 40 },
      ]),
    ];
    // Drop slightly off-axis (y=42), x=33 → snapped to 32
    const hit = findEdgeSplitHit(edges, { x: 33, y: 42 }, TOL, GRID);
    expect(hit).not.toBeNull();
    expect(hit!.edge.id).toBe('e1');
    expect(hit!.snapPoint).toEqual({ x: 32, y: 40 });
  });

  it('hits a vertical segment and snaps Y to grid', () => {
    const edges = [
      makeEdge('e1', [
        { x: 24, y: 0 },
        { x: 24, y: 64 },
      ]),
    ];
    const hit = findEdgeSplitHit(edges, { x: 27, y: 35 }, TOL, GRID);
    expect(hit).not.toBeNull();
    expect(hit!.snapPoint).toEqual({ x: 24, y: 32 });
  });

  it('returns null when the drop is too far perpendicular to the segment', () => {
    const edges = [
      makeEdge('e1', [
        { x: 0, y: 40 },
        { x: 80, y: 40 },
      ]),
    ];
    const hit = findEdgeSplitHit(edges, { x: 33, y: 60 }, TOL, GRID);
    expect(hit).toBeNull();
  });

  it('returns null when the drop is outside the segment extent', () => {
    const edges = [
      makeEdge('e1', [
        { x: 0, y: 40 },
        { x: 80, y: 40 },
      ]),
    ];
    const hit = findEdgeSplitHit(edges, { x: 200, y: 40 }, TOL, GRID);
    expect(hit).toBeNull();
  });

  it('skips a segment whose grid snap lands on an endpoint', () => {
    // Segment from (0,40) to (8,40). Dropping at x=2 snaps to 0 → endpoint.
    // Dropping at x=6 snaps to 8 → endpoint. Either way, hit should be null.
    const edges = [
      makeEdge('e1', [
        { x: 0, y: 40 },
        { x: 8, y: 40 },
      ]),
    ];
    expect(findEdgeSplitHit(edges, { x: 2, y: 40 }, TOL, GRID)).toBeNull();
    expect(findEdgeSplitHit(edges, { x: 6, y: 40 }, TOL, GRID)).toBeNull();
  });

  it('walks every segment of a multi-segment orthogonal edge', () => {
    // Edge: (0,0) → (40,0) → (40,40) → corner then down. Drop near second segment.
    const edges = [
      makeEdge('e1', [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ]),
    ];
    const hit = findEdgeSplitHit(edges, { x: 42, y: 22 }, TOL, GRID);
    expect(hit).not.toBeNull();
    expect(hit!.snapPoint).toEqual({ x: 40, y: 24 });
  });

  it('returns null for edges without a points array (unmeasured)', () => {
    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'b', data: {} }];
    expect(findEdgeSplitHit(edges, { x: 10, y: 10 }, TOL, GRID)).toBeNull();
  });

  it('picks the closest edge when several pass within tolerance', () => {
    const edges = [
      makeEdge('far', [
        { x: 0, y: 40 },
        { x: 80, y: 40 },
      ]), // 5 px off
      makeEdge('near', [
        { x: 0, y: 50 },
        { x: 80, y: 50 },
      ]), // 2 px off
    ];
    const hit = findEdgeSplitHit(edges, { x: 32, y: 48 }, TOL, GRID);
    expect(hit).not.toBeNull();
    expect(hit!.edge.id).toBe('near');
    expect(hit!.snapPoint).toEqual({ x: 32, y: 50 });
  });

  it('hits an interior bend vertex (split-at-corner is valid)', () => {
    // L-shape: (0,0) → (40,0) → (40,40). Drop right on the bend.
    const edges = [
      makeEdge('e1', [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ]),
    ];
    const hit = findEdgeSplitHit(edges, { x: 40, y: 0 }, TOL, GRID);
    expect(hit).not.toBeNull();
    expect(hit!.snapPoint).toEqual({ x: 40, y: 0 });
  });

  it('still rejects a snap that lands on the polyline outer endpoint', () => {
    // Three-vertex edge whose start IS pts[0]. Dropping right at pts[0]
    // must NOT count as a split — there's a port there.
    const edges = [
      makeEdge('e1', [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ]),
    ];
    expect(findEdgeSplitHit(edges, { x: 0, y: 0 }, TOL, GRID)).toBeNull();
    expect(findEdgeSplitHit(edges, { x: 40, y: 40 }, TOL, GRID)).toBeNull();
  });
});

describe('splitPolylineAt', () => {
  it('shares the snap point between both halves', () => {
    const { firstHalf, secondHalf } = splitPolylineAt(
      [
        { x: 0, y: 40 },
        { x: 80, y: 40 },
      ],
      0,
      { x: 32, y: 40 },
    );
    expect(firstHalf).toEqual([
      { x: 0, y: 40 },
      { x: 32, y: 40 },
    ]);
    expect(secondHalf).toEqual([
      { x: 32, y: 40 },
      { x: 80, y: 40 },
    ]);
  });

  it('collapses the zero-length seam when snap lands on a bend vertex (segment before bend)', () => {
    // L-shape: (0,0) → (40,0) → (40,40). Split on segment 0, snap at the
    // bend (40,0). Without dedupe, secondHalf would be [(40,0), (40,0), (40,40)].
    const { firstHalf, secondHalf } = splitPolylineAt(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      0,
      { x: 40, y: 0 },
    );
    expect(firstHalf).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ]);
    expect(secondHalf).toEqual([
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ]);
  });

  it('collapses the zero-length seam when snap lands on a bend vertex (segment after bend)', () => {
    // Same L-shape, but `findEdgeSplitHit` may pick segment 1 as the winner
    // (perpendicular dist 0 vs 0 on the other segment). Split on segment 1,
    // snap at the bend — without dedupe, firstHalf would be [(0,0), (40,0), (40,0)].
    const { firstHalf, secondHalf } = splitPolylineAt(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      1,
      { x: 40, y: 0 },
    );
    expect(firstHalf).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ]);
    expect(secondHalf).toEqual([
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ]);
  });
});
