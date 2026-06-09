import type { Node } from 'ng-diagram';
import type { SymbolDef, Terminal } from '../../symbols/types';
import { findConnectedNodeIds } from './connected-component';
import {
  SLD_SYMBOL_NODE_TYPE,
  SLD_WIRE_NODE_TYPE,
  type SldSymbolNodeData,
  type SldWireNodeData,
} from './node-types';

const SYMBOL_ID = 'test-symbol';

const TERMINAL_TOP: Terminal = { id: 't-top', side: 'top', xPct: 50, yPct: 0 };
const TERMINAL_BOTTOM: Terminal = { id: 't-bot', side: 'bottom', xPct: 50, yPct: 100 };

const SYMBOL_DEF: SymbolDef = {
  id: SYMBOL_ID,
  label: 'Test',
  category: 'switchgear',
  voltageTier: 'hv',
  displaySize: { width: 32, height: 64 },
  body: { width: 32, height: 48 },
  bodyViewBox: { x: 0, y: 0, width: 16, height: 24 },
  svgBody: '',
  terminals: [TERMINAL_TOP, TERMINAL_BOTTOM],
  defaultData: {},
  propertySchema: [],
};

const getSymbol = (id: string): SymbolDef | undefined =>
  id === SYMBOL_ID ? SYMBOL_DEF : undefined;

function symbol(id: string, x: number, y: number): Node<SldSymbolNodeData> {
  return {
    id,
    type: SLD_SYMBOL_NODE_TYPE,
    position: { x, y },
    size: { width: 32, height: 64 },
    data: { symbolId: SYMBOL_ID, orientation: 0, properties: {} },
  } as Node<SldSymbolNodeData>;
}

function verticalWire(id: string, x: number, y: number, length: number): Node<SldWireNodeData> {
  return {
    id,
    type: SLD_WIRE_NODE_TYPE,
    position: { x, y },
    size: { width: 16, height: length },
    data: { orientation: 'vertical' },
  } as Node<SldWireNodeData>;
}

function horizontalWire(id: string, x: number, y: number, length: number): Node<SldWireNodeData> {
  return {
    id,
    type: SLD_WIRE_NODE_TYPE,
    position: { x, y },
    size: { width: length, height: 16 },
    data: { orientation: 'horizontal' },
  } as Node<SldWireNodeData>;
}

describe('findConnectedNodeIds', () => {
  it('returns just the start node when nothing else is in range', () => {
    // Two symbols, far apart.
    const a = symbol('a', 0, 0);
    const b = symbol('b', 200, 200);
    const ids = findConnectedNodeIds('a', [a, b], getSymbol);
    expect(setOf(ids)).toEqual(['a']);
  });

  it('returns an empty set when startId is not in the node list', () => {
    const a = symbol('a', 0, 0);
    const ids = findConnectedNodeIds('missing', [a], getSymbol);
    expect(ids.size).toBe(0);
  });

  it('connects a symbol to a wire whose endpoint coincides with a terminal', () => {
    // Symbol bbox (0,0)..(32,64). Terminal-bottom world: (16, 64).
    // Vertical wire at (8, 64), length 64 → endpoints (16, 64) and (16, 128).
    // Wire's top endpoint matches symbol's bottom terminal exactly.
    const a = symbol('a', 0, 0);
    const w = verticalWire('w', 8, 64, 64);
    const ids = findConnectedNodeIds('a', [a, w], getSymbol);
    expect(setOf(ids)).toEqual(['a', 'w']);
  });

  it('connects a symbol whose terminal lands mid-segment on a wire', () => {
    // Symbol at (0, 0), terminal-top at (16, 0).
    // Horizontal busbar at (0, -8), length 200, thickness 16 → centreline y=0,
    // x range [0, 200]. Terminal-top (16, 0) sits on the busbar's mid-segment.
    const a = symbol('a', 0, 0);
    const bus = horizontalWire('bus', 0, -8, 200);
    const ids = findConnectedNodeIds('a', [a, bus], getSymbol);
    expect(setOf(ids)).toEqual(['a', 'bus']);
  });

  it('walks transitively: A connected to wire connected to B', () => {
    // A at (0, 0) terminal-bottom (16, 64). Wire from (16, 64) to (16, 128).
    // B at (0, 128) terminal-top (16, 128). Wire connects both endpoints.
    const a = symbol('a', 0, 0);
    const w = verticalWire('w', 8, 64, 64);
    const b = symbol('b', 0, 128);
    const ids = findConnectedNodeIds('a', [a, w, b], getSymbol);
    expect(setOf(ids)).toEqual(['a', 'b', 'w']);
  });

  it('walks transitively from any starting point in the component', () => {
    // Same fixture as above; start from the wire instead of either symbol.
    const a = symbol('a', 0, 0);
    const w = verticalWire('w', 8, 64, 64);
    const b = symbol('b', 0, 128);
    const ids = findConnectedNodeIds('w', [a, w, b], getSymbol);
    expect(setOf(ids)).toEqual(['a', 'b', 'w']);
  });

  it('does not bridge two separate components', () => {
    // {a, w1} and {b, w2} disjoint — no shared wire, no shared geometry.
    const a = symbol('a', 0, 0);
    const w1 = verticalWire('w1', 8, 64, 64);
    const b = symbol('b', 400, 0);
    const w2 = verticalWire('w2', 408, 64, 64);
    const ids = findConnectedNodeIds('a', [a, w1, b, w2], getSymbol);
    expect(setOf(ids)).toEqual(['a', 'w1']);
  });

  it('detects a wire endpoint touching a perpendicular wire mid-segment', () => {
    // Vertical bay wire (8, 0)..(16, 100). Top endpoint (16, 0).
    // Horizontal busbar at (0, -8), length 200 → centreline y=0, x [0, 200].
    // The bay wire's top endpoint sits on the busbar's mid-segment.
    const bay = verticalWire('bay', 8, 0, 100);
    const bus = horizontalWire('bus', 0, -8, 200);
    const ids = findConnectedNodeIds('bay', [bay, bus], getSymbol);
    expect(setOf(ids)).toEqual(['bay', 'bus']);
  });

  it('skips nodes that have no size', () => {
    // Unsized symbol should not be reachable.
    const a = symbol('a', 0, 0);
    const unsized = { ...symbol('u', 0, 64), size: undefined } as Node<SldSymbolNodeData>;
    const ids = findConnectedNodeIds('a', [a, unsized], getSymbol);
    expect(setOf(ids)).toEqual(['a']);
  });

  it('skips a symbol whose registry lookup returns undefined', () => {
    // Symbol references an id that has no SymbolDef — should not be traversed.
    const a = symbol('a', 0, 0);
    const stray = {
      ...symbol('s', 0, 64),
      data: { symbolId: 'unknown', orientation: 0, properties: {} },
    } as Node<SldSymbolNodeData>;
    const ids = findConnectedNodeIds('a', [a, stray], getSymbol);
    expect(setOf(ids)).toEqual(['a']);
  });
});

function setOf(s: ReadonlySet<string>): string[] {
  return [...s].sort();
}
