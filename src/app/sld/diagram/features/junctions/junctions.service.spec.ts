import { TestBed } from '@angular/core/testing';
import { provideNgDiagram, type Edge } from 'ng-diagram';
import { JunctionsService } from './junctions.service';
import { computeJunctionPoints } from './graph/junction-detection';

// Pure-function coverage for the O(N) junction detection. A junction is a point
// where 3+ same-kind link-continuations meet: each coincident edge endpoint
// counts 1, each segment passing through the interior counts 2.

const noSymbols = (): undefined => undefined;

// A power edge as a bare route (endpoints not attached to nodes); only its
// `points` drive junction detection.
function edge(id: string, points: readonly { x: number; y: number }[]): Edge {
  return { id, source: '', target: '', data: {}, points } as Edge;
}

function pointsOf(result: readonly { x: number; y: number }[]): string[] {
  return result.map((p) => `${p.x},${p.y}`).sort();
}

describe('computeJunctionPoints', () => {
  const noEdges: Edge[] = [];

  it('returns no junctions for an empty diagram', () => {
    expect(computeJunctionPoints([], noEdges, noSymbols)).toEqual([]);
  });

  it('marks a point where three edge endpoints meet', () => {
    // Two edges meeting end-to-end at (100,100) plus one dropping onto it.
    const left = edge('left', [
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ]);
    const right = edge('right', [
      { x: 150, y: 100 },
      { x: 100, y: 100 },
    ]);
    const down = edge('down', [
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ]);
    const result = computeJunctionPoints([], [left, right, down], noSymbols);
    expect(pointsOf(result)).toEqual(['100,100']);
  });

  it('does not mark a two-edge corner as a junction', () => {
    const left = edge('left', [
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ]);
    const down = edge('down', [
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ]);
    expect(computeJunctionPoints([], [left, down], noSymbols)).toEqual([]);
  });

  it('marks a T where an edge ends on another edge mid-segment', () => {
    // Bus passes straight through (100,100); a bay edge ends on it there.
    // 1 endpoint + 2 (bus interior halves) = 3.
    const bus = edge('bus', [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ]);
    const bay = edge('bay', [
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ]);
    const result = computeJunctionPoints([], [bus, bay], noSymbols);
    expect(pointsOf(result)).toEqual(['100,100']);
  });

  it('marks a T where an edge ends on a vertical edge mid-segment', () => {
    // Mirror of the horizontal-bus T, exercising the vertical segment index.
    const bus = edge('bus', [
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ]);
    const bay = edge('bay', [
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ]);
    const result = computeJunctionPoints([], [bus, bay], noSymbols);
    expect(pointsOf(result)).toEqual(['100,100']);
  });

  it('does not mark a plain edge crossover (no meeting point) as a junction', () => {
    // Two continuous edges cross at (100,100) but neither terminates there, so
    // there is no connection dot. Crossing alone is not a junction.
    const hbus = edge('hbus', [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ]);
    const vbus = edge('vbus', [
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ]);
    expect(computeJunctionPoints([], [hbus, vbus], noSymbols)).toEqual([]);
  });

  it('keeps two separate three-way junctions distinct', () => {
    const a = [
      edge('lA', [
        { x: 50, y: 100 },
        { x: 100, y: 100 },
      ]),
      edge('rA', [
        { x: 150, y: 100 },
        { x: 100, y: 100 },
      ]),
      edge('dA', [
        { x: 100, y: 50 },
        { x: 100, y: 100 },
      ]),
    ];
    const b = [
      edge('lB', [
        { x: 350, y: 100 },
        { x: 400, y: 100 },
      ]),
      edge('rB', [
        { x: 450, y: 100 },
        { x: 400, y: 100 },
      ]),
      edge('dB', [
        { x: 400, y: 50 },
        { x: 400, y: 100 },
      ]),
    ];
    const result = computeJunctionPoints([], [...a, ...b], noSymbols);
    expect(pointsOf(result)).toEqual(['100,100', '400,100']);
  });
});

describe('JunctionsService (scoped DI)', () => {
  // JunctionsService is provided on DiagramComponent at runtime, not at root,
  // because it depends on NgDiagramModelService. provideNgDiagram() supplies that
  // dependency here; SymbolRegistryService is root-provided and resolves on its own.
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNgDiagram(), JunctionsService],
    });
  });

  it('injects and reports no junctions for an empty model', () => {
    const service = TestBed.inject(JunctionsService);
    expect(service.junctions()).toEqual([]);
  });
});
