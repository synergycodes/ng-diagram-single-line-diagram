import { TestBed } from '@angular/core/testing';
import { provideNgDiagram, type Edge, type Node } from 'ng-diagram';
import { ConnectivityService, computeJunctionPoints } from './connectivity.service';
import { SLD_WIRE_NODE_TYPE, type SldWireNodeData } from '../geometry/node-types';

// Pure-function coverage for the O(N) junction detection. A junction is a point
// where 3+ same-kind wire-continuations meet: each coincident endpoint counts
// 1, each segment passing through the interior counts 2.

const noSymbols = (): undefined => undefined;

function horizontalWire(id: string, x: number, y: number, length: number): Node<SldWireNodeData> {
  // Centreline runs at y + 8 (thickness 16), from x to x + length.
  return {
    id,
    type: SLD_WIRE_NODE_TYPE,
    position: { x, y },
    size: { width: length, height: 16 },
    data: { orientation: 'horizontal' },
  } as Node<SldWireNodeData>;
}

function verticalWire(id: string, x: number, y: number, length: number): Node<SldWireNodeData> {
  // Centreline runs at x + 8, from y to y + length.
  return {
    id,
    type: SLD_WIRE_NODE_TYPE,
    position: { x, y },
    size: { width: 16, height: length },
    data: { orientation: 'vertical' },
  } as Node<SldWireNodeData>;
}

function pointsOf(result: readonly { x: number; y: number }[]): string[] {
  return result.map((p) => `${p.x},${p.y}`).sort();
}

describe('computeJunctionPoints', () => {
  const noEdges: Edge[] = [];

  it('returns no junctions for an empty diagram', () => {
    expect(computeJunctionPoints([], noEdges, noSymbols)).toEqual([]);
  });

  it('marks a point where three wire endpoints meet', () => {
    // Two horizontal wires meeting end-to-end at (100,100) plus a vertical wire
    // dropping from it: three coincident endpoints.
    const left = horizontalWire('left', 50, 92, 50); // end (100,100)
    const right = horizontalWire('right', 100, 92, 50); // start (100,100)
    const down = verticalWire('down', 92, 100, 50); // start (100,100)
    const result = computeJunctionPoints([left, right, down], noEdges, noSymbols);
    expect(pointsOf(result)).toEqual(['100,100']);
  });

  it('does not mark a two-wire corner as a junction', () => {
    const left = horizontalWire('left', 50, 92, 50); // end (100,100)
    const down = verticalWire('down', 92, 100, 50); // start (100,100)
    expect(computeJunctionPoints([left, down], noEdges, noSymbols)).toEqual([]);
  });

  it('marks a T where a wire ends on a busbar mid-segment', () => {
    // Busbar passes straight through (100,100); a bay wire ends on it there.
    // 1 endpoint + 2 (busbar interior halves) = 3.
    const bus = horizontalWire('bus', 0, 92, 200); // (0,100)..(200,100)
    const bay = verticalWire('bay', 92, 100, 50); // start (100,100)
    const result = computeJunctionPoints([bus, bay], noEdges, noSymbols);
    expect(pointsOf(result)).toEqual(['100,100']);
  });

  it('marks a T where a wire ends on a vertical busbar mid-segment', () => {
    // Mirror of the horizontal-busbar T, exercising the vertical segment index.
    // 1 endpoint + 2 (busbar interior halves) = 3.
    const bus = verticalWire('bus', 92, 0, 200); // (100,0)..(100,200)
    const bay = horizontalWire('bay', 50, 92, 50); // end (100,100)
    const result = computeJunctionPoints([bus, bay], noEdges, noSymbols);
    expect(pointsOf(result)).toEqual(['100,100']);
  });

  it('does not mark a plain wire crossover (no meeting point) as a junction', () => {
    // Two continuous busbars cross at (100,100) but neither terminates there, so
    // there is no connection dot. Crossing alone is not a junction.
    const hbus = horizontalWire('hbus', 0, 92, 200); // (0,100)..(200,100)
    const vbus = verticalWire('vbus', 92, 0, 200); // (100,0)..(100,200)
    expect(computeJunctionPoints([hbus, vbus], noEdges, noSymbols)).toEqual([]);
  });

  it('keeps two separate three-way junctions distinct', () => {
    const lA = horizontalWire('lA', 50, 92, 50);
    const rA = horizontalWire('rA', 100, 92, 50);
    const dA = verticalWire('dA', 92, 100, 50);
    const lB = horizontalWire('lB', 350, 92, 50);
    const rB = horizontalWire('rB', 400, 92, 50);
    const dB = verticalWire('dB', 392, 100, 50);
    const result = computeJunctionPoints([lA, rA, dA, lB, rB, dB], noEdges, noSymbols);
    expect(pointsOf(result)).toEqual(['100,100', '400,100']);
  });
});

describe('ConnectivityService (scoped DI)', () => {
  // ConnectivityService is provided on DiagramComponent at runtime, not at root,
  // because it depends on NgDiagramModelService. provideNgDiagram() supplies that
  // dependency here; SymbolRegistryService is root-provided and resolves on its own.
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNgDiagram(), ConnectivityService],
    });
  });

  it('injects and reports no junctions for an empty model', () => {
    const service = TestBed.inject(ConnectivityService);
    expect(service.junctions()).toEqual([]);
  });
});
