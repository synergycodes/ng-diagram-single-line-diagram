import { samePoint, segmentAxis } from './orthogonal';

describe('orthogonal/samePoint', () => {
  it('returns true for identical points', () => {
    expect(samePoint({ x: 8, y: 8 }, { x: 8, y: 8 })).toBe(true);
  });

  it('returns true within POSITION_TOLERANCE_PX on both axes', () => {
    expect(samePoint({ x: 8, y: 8 }, { x: 8.99, y: 8.99 })).toBe(true);
  });

  it('returns false when either axis exceeds tolerance', () => {
    // 1.01 > 1 on x; tolerance is `<`, not `<=`, so this fails.
    expect(samePoint({ x: 8, y: 8 }, { x: 9.01, y: 8 })).toBe(false);
    expect(samePoint({ x: 8, y: 8 }, { x: 8, y: 9.01 })).toBe(false);
  });

  it('catches the canonical "8 px apart" grid-cell case', () => {
    expect(samePoint({ x: 8, y: 8 }, { x: 16, y: 8 })).toBe(false);
  });
});

describe('orthogonal/segmentAxis', () => {
  it('classifies horizontal segments', () => {
    expect(segmentAxis({ x: 0, y: 8 }, { x: 16, y: 8 })).toBe('horizontal');
  });

  it('classifies vertical segments', () => {
    expect(segmentAxis({ x: 8, y: 0 }, { x: 8, y: 16 })).toBe('vertical');
  });

  it('returns null for diagonal segments', () => {
    expect(segmentAxis({ x: 0, y: 0 }, { x: 16, y: 8 })).toBeNull();
  });

  it('returns null for zero-length segments (both axes within tolerance)', () => {
    // A degenerate segment is technically both horizontal and vertical —
    // we deliberately return null so callers don't pick one arbitrarily.
    expect(segmentAxis({ x: 8, y: 8 }, { x: 8, y: 8 })).toBeNull();
  });

  it('treats sub-pixel drift as the axis (within tolerance)', () => {
    // Routing pipeline can produce off-by-a-fraction coordinates from
    // viewport-to-world transforms. The classifier should still see
    // the orthogonality.
    expect(segmentAxis({ x: 0, y: 8 }, { x: 16, y: 8.7 })).toBe('horizontal');
  });
});
