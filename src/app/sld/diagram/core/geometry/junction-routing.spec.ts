import type { Edge } from 'ng-diagram';
import { SLD_JUNCTION_PORT_IDS, type SldJunctionPortId } from './node-types';
import {
  collectBranchesByJunction,
  reassignJunctionBranches,
  type BranchEndpoint,
} from './junction-routing';

const PORT = SLD_JUNCTION_PORT_IDS;
const CENTRE = { x: 100, y: 100 };

function branch(opts: {
  id: string;
  side?: 'source' | 'target';
  port: SldJunctionPortId;
  other: { x: number; y: number };
  formerParentId?: string;
}): BranchEndpoint {
  return {
    edgeId: opts.id,
    side: opts.side ?? 'target',
    currentPort: opts.port,
    otherEndWorld: opts.other,
    formerParentId: opts.formerParentId,
  };
}

describe('reassignJunctionBranches', () => {
  it('returns no changes when every branch sits on a distinct port', () => {
    const branches = [
      branch({ id: 'l', port: PORT.left, other: { x: 0, y: 100 } }),
      branch({ id: 'r', port: PORT.right, other: { x: 200, y: 100 } }),
      branch({ id: 't', port: PORT.top, other: { x: 100, y: 0 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([]);
  });

  it('moves the new branch to the perpendicular axis when it lands on a parent-half port (other end above)', () => {
    // Parent halves L+R; branch came from a source dx-dominant but slightly
    // above → picker placed it on R → overlaps the right half. Cross-axis by
    // y direction = top.
    const branches = [
      branch({ id: 'half-a', port: PORT.left, other: { x: 0, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'branch', port: PORT.right, other: { x: 300, y: 60 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([
      { edgeId: 'branch', side: 'target', port: PORT.top },
    ]);
  });

  it('moves the new branch to the perpendicular axis (other end below)', () => {
    const branches = [
      branch({ id: 'half-a', port: PORT.left, other: { x: 0, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'branch', port: PORT.right, other: { x: 300, y: 200 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([
      { edgeId: 'branch', side: 'target', port: PORT.bottom },
    ]);
  });

  it('returns no changes for a 4-way crossing (one branch per port)', () => {
    const branches = [
      branch({ id: 'l', port: PORT.left, other: { x: 0, y: 100 } }),
      branch({ id: 'r', port: PORT.right, other: { x: 200, y: 100 } }),
      branch({ id: 't', port: PORT.top, other: { x: 100, y: 0 } }),
      branch({ id: 'b', port: PORT.bottom, other: { x: 100, y: 200 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([]);
  });

  it('accepts overlap when both perpendicular ports are already occupied', () => {
    // 4-way + extra on right → no clean cross-axis target.
    const branches = [
      branch({ id: 'l', port: PORT.left, other: { x: 0, y: 100 } }),
      branch({ id: 'r1', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 't', port: PORT.top, other: { x: 100, y: 0 } }),
      branch({ id: 'b', port: PORT.bottom, other: { x: 100, y: 200 } }),
      branch({ id: 'extra', port: PORT.right, other: { x: 300, y: 60 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([]);
  });

  it('falls back to the alternate cross-axis port when the direction-preferred one is busy', () => {
    // Parent halves L+R; a top branch already exists; new branch wants top
    // (other end above), but top is taken → alt = bottom.
    const branches = [
      branch({ id: 'half-a', port: PORT.left, other: { x: 0, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'pre-top', port: PORT.top, other: { x: 100, y: 0 } }),
      branch({ id: 'extra', port: PORT.right, other: { x: 300, y: 60 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([
      { edgeId: 'extra', side: 'target', port: PORT.bottom },
    ]);
  });

  it('keeps the first branch as keeper when no parent-half sits on the overcrowded port', () => {
    // Three fresh branches all on right. First stays; second goes to its
    // preferred cross-axis (top); third wants top too → falls to bottom.
    const branches = [
      branch({ id: 'b1', port: PORT.right, other: { x: 200, y: 80 } }),
      branch({ id: 'b2', port: PORT.right, other: { x: 200, y: 60 } }),
      branch({ id: 'b3', port: PORT.right, other: { x: 200, y: 70 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([
      { edgeId: 'b2', side: 'target', port: PORT.top },
      { edgeId: 'b3', side: 'target', port: PORT.bottom },
    ]);
  });

  it('carries the edge side (source vs target) through to the output', () => {
    const branches = [
      branch({ id: 'half-a', port: PORT.left, other: { x: 0, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'branch', side: 'source', port: PORT.right, other: { x: 300, y: 60 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([
      { edgeId: 'branch', side: 'source', port: PORT.top },
    ]);
  });

  it('is idempotent: re-running on its own output produces no further changes', () => {
    const branches = [
      branch({ id: 'half-a', port: PORT.left, other: { x: 0, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'branch', port: PORT.right, other: { x: 300, y: 60 } }),
    ];
    const firstPass = reassignJunctionBranches(CENTRE, branches);
    const after = branches.map((b) => {
      const change = firstPass.find((c) => c.edgeId === b.edgeId && c.side === b.side);
      return change ? { ...b, currentPort: change.port } : b;
    });
    expect(reassignJunctionBranches(CENTRE, after)).toEqual([]);
  });

  it('does not move parent-halves when both halves share a port (degenerate split)', () => {
    // Pathological split geometry. The middleware must not break the
    // parent line by pushing a half to the cross-axis.
    const branches = [
      branch({ id: 'half-a', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.right, other: { x: 250, y: 100 }, formerParentId: 'fp1' }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([]);
  });

  it('redirects a lone branch onto the port facing its far end after the node moved across the segment', () => {
    // Vertical parent → halves on top/bottom. The tee'd branch sits on `right`
    // (its node used to be to the right), but the node was dragged to the LEFT
    // of the segment. It must hop to `left` so it stops leaving the wrong way.
    const branches = [
      branch({ id: 'half-a', port: PORT.top, other: { x: 100, y: 0 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.bottom, other: { x: 100, y: 200 }, formerParentId: 'fp1' }),
      branch({ id: 'branch', port: PORT.right, other: { x: 0, y: 100 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([
      { edgeId: 'branch', side: 'target', port: PORT.left },
    ]);
  });

  it('leaves a lone branch put when the port facing its far end is occupied', () => {
    // Horizontal parent → halves on left/right. A branch on `top` faces RIGHT,
    // but `right` is a parent half → no free facing port, so it stays.
    const branches = [
      branch({ id: 'half-a', port: PORT.left, other: { x: 0, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.right, other: { x: 200, y: 100 }, formerParentId: 'fp1' }),
      branch({ id: 'branch', port: PORT.top, other: { x: 300, y: 100 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([]);
  });

  it('is idempotent after a redirect: a branch already facing its far end stays put', () => {
    const branches = [
      branch({ id: 'half-a', port: PORT.top, other: { x: 100, y: 0 }, formerParentId: 'fp1' }),
      branch({ id: 'half-b', port: PORT.bottom, other: { x: 100, y: 200 }, formerParentId: 'fp1' }),
      branch({ id: 'branch', port: PORT.left, other: { x: 0, y: 100 } }),
    ];
    expect(reassignJunctionBranches(CENTRE, branches)).toEqual([]);
  });
});

const FAR_END = { x: 5, y: 5 };
const resolveFar = (): { x: number; y: number } => FAR_END;

function edge(overrides: Partial<Edge> & { id: string }): Edge {
  return { routingMode: 'auto', ...overrides } as unknown as Edge;
}

describe('collectBranchesByJunction', () => {
  it('buckets a target-junction edge under its junction as a target branch', () => {
    const map = collectBranchesByJunction(
      new Set(['j1']),
      [edge({ id: 'e1', source: 'sym', target: 'j1', targetPort: PORT.top })],
      resolveFar,
    );
    expect(map.get('j1')).toEqual([
      jasmine.objectContaining({
        edgeId: 'e1',
        side: 'target',
        currentPort: PORT.top,
        otherEndWorld: FAR_END,
      }),
    ]);
  });

  it('buckets a source-junction edge as a source branch', () => {
    const map = collectBranchesByJunction(
      new Set(['j1']),
      [edge({ id: 'e1', source: 'j1', sourcePort: PORT.right, target: 'sym' })],
      resolveFar,
    );
    expect(map.get('j1')?.[0]).toEqual(
      jasmine.objectContaining({ edgeId: 'e1', side: 'source', currentPort: PORT.right }),
    );
  });

  it('registers a junction-to-junction edge under both ends', () => {
    const map = collectBranchesByJunction(
      new Set(['j1', 'j2']),
      [
        edge({
          id: 'e1',
          source: 'j1',
          sourcePort: PORT.right,
          target: 'j2',
          targetPort: PORT.left,
        }),
      ],
      resolveFar,
    );
    expect(map.get('j1')?.[0].side).toBe('source');
    expect(map.get('j2')?.[0].side).toBe('target');
  });

  it('skips manual edges with a frozen polyline', () => {
    const map = collectBranchesByJunction(
      new Set(['j1']),
      [
        edge({
          id: 'e1',
          source: 'sym',
          target: 'j1',
          targetPort: PORT.top,
          routingMode: 'manual',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        }),
      ],
      resolveFar,
    );
    expect(map.size).toBe(0);
  });

  it('ignores edges with no junction endpoint', () => {
    const map = collectBranchesByJunction(
      new Set(['j1']),
      [edge({ id: 'e1', source: 'a', target: 'b' })],
      resolveFar,
    );
    expect(map.size).toBe(0);
  });

  it('registers a junction self-loop only on its source side', () => {
    const map = collectBranchesByJunction(
      new Set(['j1']),
      [
        edge({
          id: 'e1',
          source: 'j1',
          sourcePort: PORT.top,
          target: 'j1',
          targetPort: PORT.bottom,
        }),
      ],
      resolveFar,
    );
    expect(map.get('j1')?.length).toBe(1);
    expect(map.get('j1')?.[0].side).toBe('source');
  });

  it('carries formerParentId onto the branch', () => {
    const map = collectBranchesByJunction(
      new Set(['j1']),
      [
        edge({
          id: 'e1',
          source: 'sym',
          target: 'j1',
          targetPort: PORT.top,
          data: { formerParentId: 'fp1' },
        }),
      ],
      resolveFar,
    );
    expect(map.get('j1')?.[0].formerParentId).toBe('fp1');
  });

  it('drops a branch whose far endpoint cannot be resolved', () => {
    const map = collectBranchesByJunction(
      new Set(['j1']),
      [edge({ id: 'e1', source: 'sym', target: 'j1', targetPort: PORT.top })],
      () => null,
    );
    expect(map.size).toBe(0);
  });
});
