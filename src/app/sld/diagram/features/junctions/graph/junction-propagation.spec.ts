import type { Edge, Point } from 'ng-diagram';
import {
  findCollinearPartnerSegment,
  junctionEndDelta,
  sharesFormerParent,
} from './junction-propagation';

function edge(args: {
  id: string;
  source: string;
  target: string;
  points: readonly Point[];
  data?: unknown;
}): Edge {
  return args as unknown as Edge;
}

describe('junction-propagation/sharesFormerParent', () => {
  it('returns true when both edges carry the same formerParentId', () => {
    const a = edge({
      id: 'a',
      source: '',
      target: 'j1',
      points: [],
      data: { formerParentId: 'F1' },
    });
    const b = edge({
      id: 'b',
      source: 'j1',
      target: '',
      points: [],
      data: { formerParentId: 'F1' },
    });
    expect(sharesFormerParent(a, b)).toBe(true);
  });

  it('returns false when ids differ', () => {
    const a = edge({
      id: 'a',
      source: '',
      target: 'j1',
      points: [],
      data: { formerParentId: 'F1' },
    });
    const b = edge({
      id: 'b',
      source: 'j1',
      target: '',
      points: [],
      data: { formerParentId: 'F2' },
    });
    expect(sharesFormerParent(a, b)).toBe(false);
  });

  it('returns false when either edge lacks formerParentId', () => {
    // Independent branches that happen to share a junction must not
    // count as merge-back partners.
    const a = edge({
      id: 'a',
      source: '',
      target: 'j1',
      points: [],
      data: { formerParentId: 'F1' },
    });
    const b = edge({ id: 'b', source: 'j1', target: '', points: [], data: {} });
    expect(sharesFormerParent(a, b)).toBe(false);
  });

  it('returns false when both edges lack data entirely', () => {
    const a = edge({ id: 'a', source: '', target: 'j1', points: [] });
    const b = edge({ id: 'b', source: 'j1', target: '', points: [] });
    expect(sharesFormerParent(a, b)).toBe(false);
  });
});

describe('junction-propagation/findCollinearPartnerSegment', () => {
  it('matches a collinear partner on the same horizontal axis', () => {
    // Dragged edge: horizontal at y=40 from (0,40) to (40,40), junction at target.
    // Partner: starts at junction (40,40), continues horizontally at y=40 to (80,40).
    // Both share fixed-coord y=40 → collinear → propagation expected.
    const dragged = edge({
      id: 'A',
      source: '',
      target: 'j1',
      points: [
        { x: 0, y: 40 },
        { x: 40, y: 40 },
      ],
    });
    const partner = edge({
      id: 'B',
      source: 'j1',
      target: '',
      points: [
        { x: 40, y: 40 },
        { x: 80, y: 40 },
      ],
    });
    const result = findCollinearPartnerSegment({
      edge: dragged,
      partner,
      junctionId: 'j1',
      draggedAxis: 'horizontal',
      draggedSegmentIndex: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.partnerJunctionEnd).toBe('source');
    expect(result!.partnerSegmentIndex).toBe(0);
  });

  it('matches a vertical partner whose junction is at target', () => {
    const dragged = edge({
      id: 'A',
      source: '',
      target: 'j1',
      points: [
        { x: 40, y: 0 },
        { x: 40, y: 32 },
      ],
    });
    // Partner has junction as TARGET — junction-adjacent segment is the LAST.
    const partner = edge({
      id: 'B',
      source: '',
      target: 'j1',
      points: [
        { x: 40, y: 64 },
        { x: 40, y: 32 },
      ],
    });
    const result = findCollinearPartnerSegment({
      edge: dragged,
      partner,
      junctionId: 'j1',
      draggedAxis: 'vertical',
      draggedSegmentIndex: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.partnerJunctionEnd).toBe('target');
    expect(result!.partnerSegmentIndex).toBe(0);
  });

  it('returns null when partner axis differs', () => {
    // Dragged is horizontal; partner's junction-adjacent segment is vertical.
    // No obvious propagation — leave partner alone.
    const dragged = edge({
      id: 'A',
      source: '',
      target: 'j1',
      points: [
        { x: 0, y: 40 },
        { x: 40, y: 40 },
      ],
    });
    const partner = edge({
      id: 'B',
      source: 'j1',
      target: '',
      points: [
        { x: 40, y: 40 },
        { x: 40, y: 80 },
      ],
    });
    expect(
      findCollinearPartnerSegment({
        edge: dragged,
        partner,
        junctionId: 'j1',
        draggedAxis: 'horizontal',
        draggedSegmentIndex: 0,
      }),
    ).toBeNull();
  });

  it('returns null when partner is on the same axis but different fixed coord', () => {
    // Both horizontal, but partner sits at y=48 (not y=40). User has
    // already reshaped one half; we must NOT carry the other half along.
    const dragged = edge({
      id: 'A',
      source: '',
      target: 'j1',
      points: [
        { x: 0, y: 40 },
        { x: 40, y: 40 },
      ],
    });
    const partner = edge({
      id: 'B',
      source: 'j1',
      target: '',
      points: [
        { x: 40, y: 48 },
        { x: 80, y: 48 },
      ],
    });
    expect(
      findCollinearPartnerSegment({
        edge: dragged,
        partner,
        junctionId: 'j1',
        draggedAxis: 'horizontal',
        draggedSegmentIndex: 0,
      }),
    ).toBeNull();
  });

  it('returns null when partner has too few points', () => {
    const dragged = edge({
      id: 'A',
      source: '',
      target: 'j1',
      points: [
        { x: 0, y: 40 },
        { x: 40, y: 40 },
      ],
    });
    const partner = edge({
      id: 'B',
      source: 'j1',
      target: '',
      points: [{ x: 40, y: 40 }],
    });
    expect(
      findCollinearPartnerSegment({
        edge: dragged,
        partner,
        junctionId: 'j1',
        draggedAxis: 'horizontal',
        draggedSegmentIndex: 0,
      }),
    ).toBeNull();
  });
});

describe('junction-propagation/junctionEndDelta', () => {
  it('reads the source-end delta when propagateToJunction === source', () => {
    const initial: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ];
    const updated: Point[] = [
      { x: 0, y: 16 }, // source slid down 16
      { x: 40, y: 16 },
    ];
    expect(junctionEndDelta(initial, updated, 'source')).toEqual({ dx: 0, dy: 16 });
  });

  it('reads the target-end delta when propagateToJunction === target', () => {
    const initial: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ];
    const updated: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 24 }, // target slid down 24
    ];
    expect(junctionEndDelta(initial, updated, 'target')).toEqual({ dx: 0, dy: 24 });
  });

  it('handles the case where the new polyline has a different number of points', () => {
    // `reshapeAnchoredSegment` can insert an L-bend, which adds a point.
    // The delta still reads from each polyline's LAST point — the
    // junction end of a target-side propagation. Initial last is (40,0);
    // updated last is (40,16) so delta = (0, 16).
    const initial: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ];
    const updated: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 16 }, // L-bend inserted
      { x: 40, y: 16 }, // junction end slid down 16
    ];
    expect(junctionEndDelta(initial, updated, 'target')).toEqual({ dx: 0, dy: 16 });
  });
});
