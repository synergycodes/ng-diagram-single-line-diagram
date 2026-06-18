import type { Node } from 'ng-diagram';
import type { Terminal } from '../../../symbols/types';
import type { SldSymbolNodeData } from './node-types';
import { nodeOrientation, terminalEffectiveSide, terminalWorld } from './symbol-geometry';

function term(partial: Partial<Terminal>): Terminal {
  return { id: 't', side: 'top', xPct: 0, yPct: 0, ...partial };
}

function symbolNode(partial: {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  angle?: number;
}): Node<SldSymbolNodeData> {
  return {
    id: 'n1',
    type: 'sld-symbol',
    position: partial.position ?? { x: 0, y: 0 },
    size: partial.size,
    angle: partial.angle,
    data: { symbolId: 's', properties: {} },
  } as Node<SldSymbolNodeData>;
}

describe('nodeOrientation', () => {
  it('passes through exact quarter turns', () => {
    expect(nodeOrientation({ angle: 0 })).toBe(0);
    expect(nodeOrientation({ angle: 90 })).toBe(90);
    expect(nodeOrientation({ angle: 180 })).toBe(180);
    expect(nodeOrientation({ angle: 270 })).toBe(270);
  });

  it('treats a missing angle as 0', () => {
    expect(nodeOrientation({})).toBe(0);
  });

  it('snaps to the nearest quarter turn and wraps into [0, 360)', () => {
    expect(nodeOrientation({ angle: 44 })).toBe(0);
    expect(nodeOrientation({ angle: 46 })).toBe(90);
    expect(nodeOrientation({ angle: 360 })).toBe(0);
    expect(nodeOrientation({ angle: -90 })).toBe(270);
  });
});

describe('terminalWorld', () => {
  const bbox = { width: 40, height: 80 };
  const topCentre = term({ side: 'top', xPct: 50, yPct: 0 });

  it('places a terminal in world space at angle 0', () => {
    const node = symbolNode({ position: { x: 100, y: 100 }, size: bbox, angle: 0 });
    const p = terminalWorld(node, bbox, topCentre);
    expect(p.x).toBeCloseTo(120); // x-centre of the 40-wide bbox
    expect(p.y).toBeCloseTo(100); // top edge
  });

  it('rotates the terminal about the bbox centre at 90°', () => {
    const node = symbolNode({ position: { x: 100, y: 100 }, size: bbox, angle: 90 });
    const p = terminalWorld(node, bbox, topCentre);
    // Centre is (120, 140); the top edge (40px above centre) swings to the right.
    expect(p.x).toBeCloseTo(160);
    expect(p.y).toBeCloseTo(140);
  });
});

describe('terminalEffectiveSide', () => {
  it('advances clockwise by the quarter-turn count', () => {
    expect(terminalEffectiveSide('top', 0)).toBe('top');
    expect(terminalEffectiveSide('top', 90)).toBe('right');
    expect(terminalEffectiveSide('top', 180)).toBe('bottom');
    expect(terminalEffectiveSide('top', 270)).toBe('left');
    expect(terminalEffectiveSide('right', 90)).toBe('bottom');
    expect(terminalEffectiveSide('left', 270)).toBe('bottom');
  });
});
