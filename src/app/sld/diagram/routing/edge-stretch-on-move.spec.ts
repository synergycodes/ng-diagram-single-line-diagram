import type { Edge, Node, NgDiagramModelService, Point } from 'ng-diagram';
import { applyEdgeStretchOnSelectionMoved } from './edge-stretch-on-move';

interface EdgePatch {
  readonly id: string;
  readonly points?: Point[];
}

class FakeModelService {
  nodes = new Map<string, Node>();
  edgeList: Edge[] = [];
  updated: EdgePatch[] | null = null;

  edges(): readonly Edge[] {
    return this.edgeList;
  }
  getNodeById(id: string): Node | undefined {
    return this.nodes.get(id);
  }
  updateEdges(patches: EdgePatch[]): void {
    this.updated = patches;
  }
  asReal(): NgDiagramModelService {
    return this as unknown as NgDiagramModelService;
  }
}

// Zero-size left-side port → its world position is exactly the node origin,
// so moving the node moves the port by the same delta.
function nodeAt(id: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    measuredPorts: [
      { id: 'p', position: { x: 0, y: 0 }, size: { width: 0, height: 0 }, side: 'left' },
    ],
  } as unknown as Node;
}

function manualEdge(id: string, source: string, target: string, points: Point[]): Edge {
  return {
    id,
    source,
    sourcePort: 'p',
    target,
    targetPort: 'p',
    routingMode: 'manual',
    points,
  } as unknown as Edge;
}

describe('applyEdgeStretchOnSelectionMoved', () => {
  it('skips an edge not incident to any moved node, even if a port drifted', () => {
    // n1 genuinely moved (port world 100,140 vs stored 100,100) but is NOT in
    // the moved set — the incident filter must skip e1 before the port probe.
    const model = new FakeModelService();
    model.nodes.set('n1', nodeAt('n1', 100, 140));
    model.nodes.set('n2', nodeAt('n2', 100, 300));
    model.edgeList = [
      manualEdge('e1', 'n1', 'n2', [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ]),
    ];

    applyEdgeStretchOnSelectionMoved(model.asReal(), new Set(['other']));

    expect(model.updated).toBeNull();
  });

  it('stretches an edge incident to a moved node to follow the live port', () => {
    const model = new FakeModelService();
    model.nodes.set('n1', nodeAt('n1', 100, 140));
    model.nodes.set('n2', nodeAt('n2', 100, 300));
    model.edgeList = [
      manualEdge('e1', 'n1', 'n2', [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ]),
    ];

    applyEdgeStretchOnSelectionMoved(model.asReal(), new Set(['n1']));

    expect(model.updated).toEqual([
      {
        id: 'e1',
        points: [
          { x: 100, y: 140 },
          { x: 100, y: 300 },
        ],
      },
    ]);
  });

  it('leaves an incident edge untouched when no port drifted', () => {
    // Both endpoints already sit on the live ports — nothing to re-anchor.
    const model = new FakeModelService();
    model.nodes.set('n1', nodeAt('n1', 100, 100));
    model.nodes.set('n2', nodeAt('n2', 100, 300));
    model.edgeList = [
      manualEdge('e1', 'n1', 'n2', [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ]),
    ];

    applyEdgeStretchOnSelectionMoved(model.asReal(), new Set(['n1', 'n2']));

    expect(model.updated).toBeNull();
  });

  it('ignores auto-routed edges', () => {
    const model = new FakeModelService();
    model.nodes.set('n1', nodeAt('n1', 100, 140));
    model.nodes.set('n2', nodeAt('n2', 100, 300));
    const auto = manualEdge('e1', 'n1', 'n2', [
      { x: 100, y: 100 },
      { x: 100, y: 300 },
    ]);
    (auto as { routingMode: string }).routingMode = 'auto';
    model.edgeList = [auto];

    applyEdgeStretchOnSelectionMoved(model.asReal(), new Set(['n1']));

    expect(model.updated).toBeNull();
  });
});
