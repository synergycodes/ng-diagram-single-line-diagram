// Geometric wire-snapping: when a dragged node's terminal lands near a wire,
// compute the nudge that lands it exactly on that wire. No edge is created —
// SLD connections are inferred from coincident geometry, not from a link model.
import type { Node, Point } from 'ng-diagram';
import type { SymbolDef } from '../../../symbols/types';
import { GRID } from './constants';
import { isSymbolNode, isWireNode, nodeWireSegment, type SldWireNodeData } from './node-types';
import { terminalWorld } from './symbol-geometry';

// Snap pull radius in px (one grid cell): a terminal within this of a wire snaps to it.
const SNAP_TOLERANCE_PX = GRID;

export interface TerminalPoint {
  readonly nodeId: string;
  readonly terminalId: string;
  readonly worldX: number;
  readonly worldY: number;
}

// No edge is created — connections are derived geometrically; the caller just nudges the node.
export interface SnapResult {
  readonly movedNode: Node;
  readonly movedTerminal: TerminalPoint;
  readonly snapPoint: Point;
  readonly delta: Point;
}

// Best snap for a just-moved node: the closest terminal-to-wire pairing within
// tolerance, or null if nothing is near enough. Brute-force over terminals ×
// wires — the moved node has a handful of terminals, so this stays cheap.
export function findWireSnap(
  movedNode: Node,
  allNodes: readonly Node[],
  getSymbol: (id: string) => SymbolDef | undefined,
): SnapResult | null {
  const terminals = terminalsOf(movedNode, getSymbol);
  if (terminals.length === 0) return null;

  const wires = allNodes.filter(
    (node): node is Node<SldWireNodeData> => isWireNode(node) && node.id !== movedNode.id,
  );
  if (wires.length === 0) return null;

  let best: SnapResult | null = null;
  // Seed just past tolerance so the first in-range candidate always wins.
  let bestDist = SNAP_TOLERANCE_PX + 1;

  for (const terminal of terminals) {
    for (const wire of wires) {
      const candidate = snapTerminalToWire(terminal, wire);
      if (!candidate) continue;
      if (candidate.distance < bestDist) {
        bestDist = candidate.distance;
        best = {
          movedNode,
          movedTerminal: terminal,
          snapPoint: candidate.point,
          delta: {
            x: candidate.point.x - terminal.worldX,
            y: candidate.point.y - terminal.worldY,
          },
        };
      }
    }
  }

  return bestDist <= SNAP_TOLERANCE_PX ? best : null;
}

function terminalsOf(
  node: Node,
  getSymbol: (id: string) => SymbolDef | undefined,
): TerminalPoint[] {
  const size = node.size;
  if (!size) return [];

  if (isSymbolNode(node)) {
    const data = node.data;
    const symbolDef = getSymbol(data.symbolId);
    if (!symbolDef) return [];
    return (
      symbolDef.terminals
        // Wires are power-only — control terminals don't pull symbols onto them.
        .filter((terminal) => terminal.kind !== 'control')
        .map((terminal) => {
          const world = terminalWorld(node, size, terminal);
          return {
            nodeId: node.id,
            terminalId: terminal.id,
            worldX: world.x,
            worldY: world.y,
          };
        })
    );
  }

  if (isWireNode(node)) {
    const seg = nodeWireSegment(node);
    if (!seg) return [];
    return [
      { nodeId: node.id, terminalId: 'a', worldX: seg.start.x, worldY: seg.start.y },
      { nodeId: node.id, terminalId: 'b', worldX: seg.end.x, worldY: seg.end.y },
    ];
  }

  return [];
}

// Project a terminal onto one wire. Rejects it unless the terminal is within
// tolerance both along the wire (past either end) and perpendicular to it.
// `distance` is the perpendicular gap — the ranking key in `findWireSnap`.
function snapTerminalToWire(
  terminal: TerminalPoint,
  wire: Node<SldWireNodeData>,
): { point: Point; distance: number } | null {
  const size = wire.size;
  if (!size) return null;
  const horizontal = wire.data.orientation === 'horizontal';

  if (horizontal) {
    const centreY = wire.position.y + size.height / 2;
    const startX = wire.position.x;
    const endX = wire.position.x + size.width;
    if (terminal.worldX < startX - SNAP_TOLERANCE_PX || terminal.worldX > endX + SNAP_TOLERANCE_PX)
      return null;
    const perpDist = Math.abs(terminal.worldY - centreY);
    if (perpDist > SNAP_TOLERANCE_PX) return null;
    return {
      point: { x: clampToWireRangeAndSnap(terminal.worldX, startX, endX), y: centreY },
      distance: perpDist,
    };
  }

  const centreX = wire.position.x + size.width / 2;
  const startY = wire.position.y;
  const endY = wire.position.y + size.height;
  if (terminal.worldY < startY - SNAP_TOLERANCE_PX || terminal.worldY > endY + SNAP_TOLERANCE_PX)
    return null;
  const perpDist = Math.abs(terminal.worldX - centreX);
  if (perpDist > SNAP_TOLERANCE_PX) return null;
  return {
    point: { x: centreX, y: clampToWireRangeAndSnap(terminal.worldY, startY, endY) },
    distance: perpDist,
  };
}

// Slide the snap point along the wire: clamp to the wire's span so it can't land
// past an end, then round to the grid so the join stays grid-aligned.
function clampToWireRangeAndSnap(value: number, start: number, end: number): number {
  const clamped = Math.max(start, Math.min(end, value));
  return Math.round(clamped / GRID) * GRID;
}
