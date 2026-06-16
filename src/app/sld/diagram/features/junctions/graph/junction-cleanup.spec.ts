import type { Edge, Node, NgDiagramModelService, NgDiagramService } from 'ng-diagram';
import {
  SLD_JUNCTION_NODE_TYPE,
  SLD_SYMBOL_NODE_TYPE,
  type SldLinkEdgeData,
} from '../../../core/geometry/node-types';
import { reconcileJunction } from './junction-cleanup';

const JUNCTION_ID = 'sld-junction-J1';
const FORMER_PARENT = 'shared-parent-uuid';

class FakeModelService {
  nodes = new Map<string, Node>();
  edges = new Map<string, Edge>();

  getNodeById(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  getConnectedEdges(nodeId: string): readonly Edge[] {
    const out: Edge[] = [];
    for (const e of this.edges.values()) {
      if (e.source === nodeId || e.target === nodeId) out.push(e);
    }
    return out;
  }

  deleteNodes(ids: readonly string[]): void {
    for (const id of ids) this.nodes.delete(id);
  }

  deleteEdges(ids: readonly string[]): void {
    for (const id of ids) this.edges.delete(id);
  }

  addEdges(edges: readonly Edge[]): void {
    for (const e of edges) this.edges.set(e.id, e);
  }

  asReal(): NgDiagramModelService {
    return this as unknown as NgDiagramModelService;
  }
}

class FakeNgDiagramService {
  transactionCalls = 0;

  transaction(fn: () => void): void {
    this.transactionCalls++;
    fn();
  }

  asReal(): NgDiagramService {
    return this as unknown as NgDiagramService;
  }
}

function makeJunction(id = JUNCTION_ID): Node {
  return {
    id,
    type: SLD_JUNCTION_NODE_TYPE,
    position: { x: 100, y: 100 },
    size: { width: 8, height: 8 },
    data: {},
  } as Node;
}

function makeSymbol(id: string): Node {
  return {
    id,
    type: SLD_SYMBOL_NODE_TYPE,
    position: { x: 0, y: 0 },
    size: { width: 32, height: 32 },
    data: {},
  } as Node;
}

interface EdgeOverrides {
  readonly id?: string;
  readonly source?: string;
  readonly target?: string;
  readonly sourcePort?: string;
  readonly targetPort?: string;
  readonly sourcePosition?: { x: number; y: number };
  readonly targetPosition?: { x: number; y: number };
  readonly data?: SldLinkEdgeData;
  readonly routingMode?: 'auto' | 'manual';
  readonly points?: { x: number; y: number }[];
}

function makeEdge(id: string, overrides: EdgeOverrides = {}): Edge {
  return {
    id,
    source: 'a',
    target: 'b',
    routingMode: 'auto',
    data: {},
    ...overrides,
  } as Edge;
}

describe('reconcileJunction', () => {
  describe('guards', () => {
    it('is a no-op for an empty / missing node id', () => {
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      reconcileJunction(model.asReal(), ng.asReal(), '');
      reconcileJunction(model.asReal(), ng.asReal(), 'nope');
      expect(model.nodes.size).toBe(0);
      expect(ng.transactionCalls).toBe(0);
    });

    it('is a no-op for a non-junction node', () => {
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const sym = makeSymbol('sym-1');
      model.nodes.set(sym.id, sym);
      reconcileJunction(model.asReal(), ng.asReal(), sym.id);
      expect(model.nodes.has(sym.id)).toBe(true);
      expect(ng.transactionCalls).toBe(0);
    });
  });

  describe('orphan (0 branches)', () => {
    it('deletes a junction with zero connected edges', () => {
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      reconcileJunction(model.asReal(), ng.asReal(), j.id);
      expect(model.nodes.has(j.id)).toBe(false);
    });
  });

  describe('keep (1 or 3+ branches)', () => {
    it('keeps a junction with one remaining connected edge', () => {
      // A single connection is a transient mid-deletion state — neither an
      // orphan (0) nor a passthrough (2), so reconcile leaves it alone.
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      model.edges.set('e1', makeEdge('e1', { source: j.id, target: 'sym-other' }));
      reconcileJunction(model.asReal(), ng.asReal(), j.id);
      expect(model.nodes.has(j.id)).toBe(true);
      expect(ng.transactionCalls).toBe(0);
    });

    it('keeps a junction with three connections (genuine T-branch)', () => {
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      model.edges.set('e1', makeEdge('e1', { source: j.id, target: 'a' }));
      model.edges.set('e2', makeEdge('e2', { source: j.id, target: 'b' }));
      model.edges.set('e3', makeEdge('e3', { source: 'c', target: j.id }));
      reconcileJunction(model.asReal(), ng.asReal(), j.id);
      expect(model.nodes.has(j.id)).toBe(true);
      expect(model.edges.size).toBe(3);
      expect(ng.transactionCalls).toBe(0);
    });
  });

  describe('collapse (2 branches)', () => {
    it('merges two halves of a former split parent into a single edge inside a transaction', () => {
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      const data: SldLinkEdgeData = { formerParentId: FORMER_PARENT };
      // Half A: junction-as-target, real source on `sym-left`.
      model.edges.set(
        'eA',
        makeEdge('eA', {
          source: 'sym-left',
          sourcePort: 'p-right',
          target: j.id,
          targetPort: 'p-left',
          data,
        }),
      );
      // Half B: junction-as-source, real target on `sym-right`.
      model.edges.set(
        'eB',
        makeEdge('eB', {
          source: j.id,
          sourcePort: 'p-right',
          target: 'sym-right',
          targetPort: 'p-left',
          data,
        }),
      );

      reconcileJunction(model.asReal(), ng.asReal(), j.id);

      expect(ng.transactionCalls).toBe(1);
      expect(model.nodes.has(j.id)).toBe(false);
      expect(model.edges.has('eA')).toBe(false);
      expect(model.edges.has('eB')).toBe(false);
      expect(model.edges.size).toBe(1);
      const merged = Array.from(model.edges.values())[0];
      // Endpoints are the NON-junction sides of each half, with their ports
      // preserved. Source/target order tracks input order — the merge doesn't
      // try to canonicalise direction.
      expect(merged.source).toBe('sym-left');
      expect(merged.sourcePort).toBe('p-right');
      expect(merged.target).toBe('sym-right');
      expect(merged.targetPort).toBe('p-left');
      expect(merged.id).toMatch(/^sld-link-/);
    });

    it('preserves the combined polyline of the two halves instead of resetting it', () => {
      // A straight vertical parent was split at the junction. Deleting the dot
      // must give back the SAME straight line (folding the 8px seam), not a
      // freshly minimised path that loses the original geometry.
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      const data: SldLinkEdgeData = { formerParentId: FORMER_PARENT };
      // Half A ends at the junction top port; Half B starts at the bottom port.
      model.edges.set(
        'eA',
        makeEdge('eA', {
          source: 'sym-top',
          sourcePort: 'p-bottom',
          target: j.id,
          targetPort: 'p-top',
          routingMode: 'manual',
          points: [
            { x: 104, y: 40 },
            { x: 104, y: 100 },
          ],
          data,
        }),
      );
      model.edges.set(
        'eB',
        makeEdge('eB', {
          source: j.id,
          sourcePort: 'p-bottom',
          target: 'sym-bottom',
          targetPort: 'p-top',
          routingMode: 'manual',
          points: [
            { x: 104, y: 108 },
            { x: 104, y: 200 },
          ],
          data,
        }),
      );

      reconcileJunction(model.asReal(), ng.asReal(), j.id);

      const merged = Array.from(model.edges.values())[0];
      expect(merged.routingMode).toBe('manual');
      // Seam folded: one straight segment spanning both halves' far ends.
      expect(merged.points).toEqual([
        { x: 104, y: 40 },
        { x: 104, y: 200 },
      ]);
    });

    it('keeps a genuine corner when one half was reshaped into an L', () => {
      // Half A runs vertically into the junction; Half B leaves horizontally.
      // The junction bend is a real corner (not a collinear seam) and survives.
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      const data: SldLinkEdgeData = { formerParentId: FORMER_PARENT };
      model.edges.set(
        'eA',
        makeEdge('eA', {
          source: 'sym-top',
          target: j.id,
          routingMode: 'manual',
          points: [
            { x: 104, y: 40 },
            { x: 104, y: 104 },
          ],
          data,
        }),
      );
      model.edges.set(
        'eB',
        makeEdge('eB', {
          source: j.id,
          target: 'sym-right',
          routingMode: 'manual',
          points: [
            { x: 104, y: 104 },
            { x: 200, y: 104 },
          ],
          data,
        }),
      );

      reconcileJunction(model.asReal(), ng.asReal(), j.id);

      const merged = Array.from(model.edges.values())[0];
      expect(merged.points).toEqual([
        { x: 104, y: 40 },
        { x: 104, y: 104 },
        { x: 200, y: 104 },
      ]);
    });

    it('collapses 2 branches with no formerParentId — the relink-disconnect case', () => {
      // User relinked one branch of a 3-junction away; the remaining two have
      // no formerParentId. The junction loses its dot (<3 branches), so we
      // drop the node too rather than leave stray ports without a marker.
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      model.edges.set(
        'e1',
        makeEdge('e1', { source: 'a', sourcePort: 'p-r', target: j.id, targetPort: 'p-left' }),
      );
      model.edges.set(
        'e2',
        makeEdge('e2', { source: j.id, sourcePort: 'p-bottom', target: 'b', targetPort: 'p-top' }),
      );

      reconcileJunction(model.asReal(), ng.asReal(), j.id);

      expect(ng.transactionCalls).toBe(1);
      expect(model.nodes.has(j.id)).toBe(false);
      expect(model.edges.size).toBe(1);
      const merged = Array.from(model.edges.values())[0];
      expect(merged.source).toBe('a');
      expect(merged.target).toBe('b');
    });

    it('collapses 2 branches that carry DIFFERENT formerParentId values', () => {
      // Two halves from different historical splits. The merge is aggressive:
      // any 2-branch junction is a passthrough and collapses regardless.
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      model.edges.set(
        'e1',
        makeEdge('e1', { source: j.id, target: 'a', data: { formerParentId: 'parent-1' } }),
      );
      model.edges.set(
        'e2',
        makeEdge('e2', { source: j.id, target: 'b', data: { formerParentId: 'parent-2' } }),
      );

      reconcileJunction(model.asReal(), ng.asReal(), j.id);

      expect(ng.transactionCalls).toBe(1);
      expect(model.nodes.has(j.id)).toBe(false);
      expect(model.edges.size).toBe(1);
    });

    it('preserves a dangling far endpoint by copying its position into the merged edge', () => {
      // The other half's far end is a dangling free endpoint (id '' + position);
      // the merge must keep that position, not snap it to the origin.
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      const data: SldLinkEdgeData = { formerParentId: FORMER_PARENT };
      model.edges.set(
        'eA',
        makeEdge('eA', {
          source: 'sym-left',
          sourcePort: 'p-right',
          target: j.id,
          targetPort: 'p-left',
          data,
        }),
      );
      model.edges.set(
        'eB',
        makeEdge('eB', {
          source: j.id,
          sourcePort: 'p-right',
          // Dangling far end: `target: ''` plus a stored world position.
          target: '',
          targetPosition: { x: 320, y: 480 },
          data,
        }),
      );

      reconcileJunction(model.asReal(), ng.asReal(), j.id);

      expect(model.edges.size).toBe(1);
      const merged = Array.from(model.edges.values())[0];
      expect(merged.source).toBe('sym-left');
      expect(merged.target).toBe('');
      expect(merged.targetPosition).toEqual({ x: 320, y: 480 });
    });

    it('clears the merged edge data so a stale formerParentId cannot retrigger a second collapse', () => {
      // The new edge starts a clean slate — no `formerParentId`. Otherwise a
      // future split + delete on this edge would re-merge against ghost
      // siblings that no longer exist.
      const model = new FakeModelService();
      const ng = new FakeNgDiagramService();
      const j = makeJunction();
      model.nodes.set(j.id, j);
      const data: SldLinkEdgeData = { formerParentId: FORMER_PARENT };
      model.edges.set('eA', makeEdge('eA', { source: 'a', target: j.id, data }));
      model.edges.set('eB', makeEdge('eB', { source: j.id, target: 'b', data }));

      reconcileJunction(model.asReal(), ng.asReal(), j.id);

      const merged = Array.from(model.edges.values())[0];
      const mergedData = merged.data as SldLinkEdgeData | undefined;
      expect(mergedData?.formerParentId).toBeUndefined();
    });
  });
});
