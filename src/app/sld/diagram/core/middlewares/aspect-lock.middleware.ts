import type { Middleware } from 'ng-diagram';
import type { SymbolDef } from '../../../symbols/types';
import {
  WIRE_THICKNESS_PX,
  isSymbolNode,
  isWireNode,
  type SldWireNodeData,
  type SymbolOrientation,
} from '../geometry/node-types';
import { terminalEffectiveSide } from '../geometry/symbol-geometry';

// Middleware on the model-update pipeline: clamps resizeNode actions so SLD
// elements keep their valid shape. Symbol axes resize only when a terminal sits
// on that axis (post-rotation); wires resize only along their length axis.
export function createAspectLockMiddleware(options: {
  grid: number;
  getSymbol: (id: string) => SymbolDef | undefined;
}): Middleware<'sld-aspect-lock'> {
  const { grid, getSymbol } = options;

  return {
    name: 'sld-aspect-lock',
    execute(context, next) {
      const { state, modelActionTypes, helpers } = context;

      // Only a resize can violate the aspect lock — let everything else pass.
      if (!modelActionTypes.includes('resizeNode')) {
        next();
        return;
      }

      const affectedIds = helpers.getAffectedNodeIds(['size']);
      if (affectedIds.length === 0) {
        next();
        return;
      }

      const nodesToUpdate: { id: string; size: { width: number; height: number } }[] = [];

      for (const id of affectedIds) {
        const current = state.nodes.find((node) => node.id === id);
        if (!current?.size) continue;
        const size = current.size;

        if (isWireNode(current)) {
          const locked = lockWireSize(current.data, size);
          if (locked) nodesToUpdate.push({ id, size: locked });
          continue;
        }

        if (!isSymbolNode(current)) continue;

        const data = current.data;
        const symbol = data.symbolId ? getSymbol(data.symbolId) : undefined;
        if (!symbol) continue;

        const orientation = data.orientation ?? 0;
        const locked = lockSymbolSize(symbol, size, orientation, grid);
        if (locked) nodesToUpdate.push({ id, size: locked });
      }

      // Feed corrected sizes back into the same tick; nothing to fix => pass through.
      if (nodesToUpdate.length > 0) {
        next({ nodesToUpdate });
      } else {
        next();
      }
    },
  };
}

// Clamp a symbol resize: an axis only grows if a terminal lives on that axis
// (so there's a lead to lengthen); otherwise it's pinned to the body size.
// Returns null when the proposed size already satisfies the lock.
function lockSymbolSize(
  symbol: SymbolDef,
  proposed: { width: number; height: number },
  orientation: SymbolOrientation,
  grid: number,
): { width: number; height: number } | null {
  const effectiveSides = symbol.terminals.map((terminal) =>
    terminalEffectiveSide(terminal.side, orientation),
  );
  const hasHorizontalTerminal = effectiveSides.some((side) => side === 'left' || side === 'right');
  const hasVerticalTerminal = effectiveSides.some((side) => side === 'top' || side === 'bottom');

  // At 90°/270° the body's width and height swap in screen space.
  const quarterTurn = orientation === 90 || orientation === 270;
  const bodyW = quarterTurn ? symbol.body.height : symbol.body.width;
  const bodyH = quarterTurn ? symbol.body.width : symbol.body.height;

  const lockedW = hasHorizontalTerminal ? Math.max(bodyW, snap(proposed.width, grid)) : bodyW;
  const lockedH = hasVerticalTerminal ? Math.max(bodyH, snap(proposed.height, grid)) : bodyH;

  if (lockedW === proposed.width && lockedH === proposed.height) return null;
  return { width: lockedW, height: lockedH };
}

// Pin a wire's cross-axis to WIRE_THICKNESS_PX; only its length axis is free.
// Returns null when the proposed size already has the right thickness.
function lockWireSize(
  data: SldWireNodeData,
  proposed: { width: number; height: number },
): { width: number; height: number } | null {
  if (data.orientation === 'horizontal') {
    if (proposed.height === WIRE_THICKNESS_PX) return null;
    return { width: proposed.width, height: WIRE_THICKNESS_PX };
  }
  if (proposed.width === WIRE_THICKNESS_PX) return null;
  return { width: WIRE_THICKNESS_PX, height: proposed.height };
}

function snap(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}
