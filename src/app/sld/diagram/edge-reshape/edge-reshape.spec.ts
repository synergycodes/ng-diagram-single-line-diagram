import { findReshapeableSegments, reshapeAnchoredSegment, reshapeSegment } from './edge-reshape';

describe('findReshapeableSegments', () => {
  it('returns empty for fewer than 2 points', () => {
    expect(findReshapeableSegments(undefined, 'port', 'port')).toEqual([]);
    expect(findReshapeableSegments([], 'port', 'port')).toEqual([]);
    expect(findReshapeableSegments([{ x: 0, y: 0 }], 'port', 'port')).toEqual([]);
  });

  it('emits a handle for every orthogonal segment, including first and last', () => {
    // Z-shape: (0,0) → (50,0) → (50,40) → (100,40)
    // Three orthogonal segments — all reshapeable.
    const r = findReshapeableSegments(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 40 },
        { x: 100, y: 40 },
      ],
      'port',
      'port',
    );
    expect(r.map((s) => s.segmentIndex)).toEqual([0, 1, 2]);
    expect(r[0]).toEqual(
      jasmine.objectContaining({
        axis: 'horizontal',
        anchorPortAtSource: true,
        anchorPortAtTarget: false,
        propagateToJunction: null,
      }),
    );
    expect(r[1]).toEqual(
      jasmine.objectContaining({
        axis: 'vertical',
        anchorPortAtSource: false,
        anchorPortAtTarget: false,
        propagateToJunction: null,
      }),
    );
    expect(r[2]).toEqual(
      jasmine.objectContaining({
        axis: 'horizontal',
        anchorPortAtSource: false,
        anchorPortAtTarget: true,
        propagateToJunction: null,
      }),
    );
  });

  it('skips degenerate (diagonal or zero-length) segments', () => {
    const r = findReshapeableSegments(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 80, y: 30 }, // diagonal — not orthogonal
        { x: 100, y: 30 },
        { x: 100, y: 60 },
        { x: 200, y: 60 },
      ],
      'port',
      'port',
    );
    // Indices 0..4. Index 1: (50,0)→(80,30) diagonal, skip.
    // Index 2: (80,30)→(100,30) horizontal, keep.
    // Index 3: (100,30)→(100,60) vertical, keep.
    // Index 0: (0,0)→(50,0) horizontal, keep.
    // Index 4: (100,60)→(200,60) horizontal, keep.
    expect(r.map((s) => s.segmentIndex)).toEqual([0, 2, 3, 4]);
  });

  it('flags propagateToJunction when source is a junction', () => {
    const r = findReshapeableSegments(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 40 },
        { x: 100, y: 40 },
      ],
      'junction',
      'port',
    );
    expect(r[0]).toEqual(
      jasmine.objectContaining({
        segmentIndex: 0,
        propagateToJunction: 'source',
        anchorPortAtSource: false,
        anchorPortAtTarget: false,
      }),
    );
    expect(r[2]).toEqual(
      jasmine.objectContaining({
        segmentIndex: 2,
        propagateToJunction: null,
        anchorPortAtSource: false,
        anchorPortAtTarget: true,
      }),
    );
  });

  it('flags propagateToJunction when target is a junction', () => {
    const r = findReshapeableSegments(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 40 },
        { x: 100, y: 40 },
      ],
      'port',
      'junction',
    );
    expect(r[2]).toEqual(
      jasmine.objectContaining({
        segmentIndex: 2,
        propagateToJunction: 'target',
        anchorPortAtTarget: false,
      }),
    );
    expect(r[0]).toEqual(
      jasmine.objectContaining({
        segmentIndex: 0,
        propagateToJunction: null,
        anchorPortAtSource: true,
      }),
    );
  });

  it('leaves anchor flags off for dangling endpoints (free reshape, both ends shift)', () => {
    const r = findReshapeableSegments(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 40 },
        { x: 100, y: 40 },
      ],
      'dangling',
      'dangling',
    );
    expect(r.length).toBe(3);
    for (const seg of r) {
      expect(seg.anchorPortAtSource).toBe(false);
      expect(seg.anchorPortAtTarget).toBe(false);
      expect(seg.propagateToJunction).toBeNull();
    }
  });

  it('on a 2-point edge sets both anchor flags when both ends are ports', () => {
    const r = findReshapeableSegments(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      'port',
      'port',
    );
    expect(r.length).toBe(1);
    expect(r[0]).toEqual(
      jasmine.objectContaining({
        segmentIndex: 0,
        axis: 'horizontal',
        anchorPortAtSource: true,
        anchorPortAtTarget: true,
        propagateToJunction: null,
      }),
    );
  });
});

describe('reshapeSegment', () => {
  const GRID = 8;

  it('moves a horizontal segment vertically, snaps to grid', () => {
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
    ];
    const out = reshapeSegment(edge, 2, 'horizontal', 0, 11, GRID);
    expect(out[2]).toEqual({ x: 50, y: 48 });
    expect(out[3]).toEqual({ x: 100, y: 48 });
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]).toEqual({ x: 50, y: 0 });
    expect(out[4]).toEqual({ x: 100, y: 80 });
  });

  it('moves a vertical segment horizontally, snaps to grid', () => {
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ];
    const out = reshapeSegment(edge, 1, 'vertical', -19, 0, GRID);
    expect(out[1]).toEqual({ x: 32, y: 0 });
    expect(out[2]).toEqual({ x: 32, y: 40 });
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[3]).toEqual({ x: 100, y: 40 });
  });

  it('does not mutate the input array', () => {
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ];
    const before = JSON.stringify(edge);
    reshapeSegment(edge, 1, 'vertical', 10, 0, GRID);
    expect(JSON.stringify(edge)).toBe(before);
  });
});

describe('reshapeAnchoredSegment', () => {
  const GRID = 8;

  it('degrades to reshapeSegment when both anchors are false', () => {
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ];
    const anchored = reshapeAnchoredSegment(edge, 1, 'vertical', -19, 0, GRID, false, false);
    const plain = reshapeSegment(edge, 1, 'vertical', -19, 0, GRID);
    expect(anchored).toEqual(plain);
  });

  it('inserts an L-bend at source when anchoring the first segment', () => {
    // First-segment horizontal Z-edge. Drag the first segment DOWN by 8.
    // Source port at (0,0) must stay put → L-bend inserted at index 1.
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ];
    const out = reshapeAnchoredSegment(edge, 0, 'horizontal', 0, 8, GRID, true, false);
    expect(out).toEqual([
      { x: 0, y: 0 }, // source untouched
      { x: 0, y: 8 }, // new elbow at source.x, snapped perp
      { x: 50, y: 8 }, // original p1 with shifted y
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it('inserts an L-bend at target when anchoring the last segment', () => {
    // Last-segment horizontal Z-edge. Drag the last segment DOWN by 8.
    // Target port at (100,40) must stay put → L-bend inserted before last.
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ];
    const out = reshapeAnchoredSegment(edge, 2, 'horizontal', 0, 8, GRID, false, true);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 48 }, // original p[2] with shifted y
      { x: 100, y: 48 }, // new elbow at target.x, snapped perp
      { x: 100, y: 40 }, // target untouched
    ]);
  });

  it('inserts an L-bend at BOTH ends for a 2-point port→port edge', () => {
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ];
    const out = reshapeAnchoredSegment(edge, 0, 'horizontal', 0, 8, GRID, true, true);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 8 }, // source-side elbow
      { x: 50, y: 8 }, // target-side elbow
      { x: 50, y: 0 },
    ]);
  });

  it('inserts an L-bend on a vertical first segment (port→port→…)', () => {
    // First segment vertical. Drag horizontally (perpendicular).
    const edge = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 50, y: 40 },
    ];
    const out = reshapeAnchoredSegment(edge, 0, 'vertical', 8, 0, GRID, true, false);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 8, y: 0 }, // new elbow at source.y, snapped perp x
      { x: 8, y: 40 }, // original p1 with shifted x
      { x: 50, y: 40 },
    ]);
  });

  it("anchor flag is ignored when segment isn't at the matching end", () => {
    // 5-point edge, reshape INTERIOR segment (index 1). anchorSource=true
    // shouldn\'t fire because segmentIndex !== 0.
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
    ];
    const out = reshapeAnchoredSegment(edge, 1, 'vertical', -19, 0, GRID, true, true);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 32, y: 0 },
      { x: 32, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
    ]);
  });

  it('keeps the polyline strictly orthogonal after L-bend insertion (all four cases)', () => {
    const edge = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ];
    const cases = [
      reshapeAnchoredSegment(edge, 0, 'horizontal', 0, 8, GRID, true, false),
      reshapeAnchoredSegment(edge, 2, 'horizontal', 0, -8, GRID, false, true),
      reshapeAnchoredSegment(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
        0,
        'horizontal',
        0,
        16,
        GRID,
        true,
        true,
      ),
      reshapeAnchoredSegment(
        [
          { x: 0, y: 0 },
          { x: 0, y: 40 },
          { x: 50, y: 40 },
        ],
        0,
        'vertical',
        8,
        0,
        GRID,
        true,
        false,
      ),
    ];
    for (const points of cases) {
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const orthogonal = Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
        expect(orthogonal)
          .withContext(
            `segment ${i}: (${a.x},${a.y}) → (${b.x},${b.y}) in ${JSON.stringify(points)}`,
          )
          .toBe(true);
      }
    }
  });
});
