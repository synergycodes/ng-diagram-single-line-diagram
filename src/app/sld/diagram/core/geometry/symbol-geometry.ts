// Maps a symbol's terminals and leads from its design-time wrapper frame into
// world coordinates under any of the four orientations. The single home for the
// rotate-then-translate math so the canvas renderer and the SVG exporter agree.
import type { Node, Point } from 'ng-diagram';
import type { SymbolDef, Terminal, TerminalSide } from '../../../symbols/types';
import type { SldSymbolNodeData, SymbolOrientation } from './node-types';

// Un-rotated wrapper size for a symbol. For orientation ∈ {90, 270} the bbox
// sides are swapped, so terminal-percentage math reads from the right axis.
export function wrapperDimensions(
  bbox: { width: number; height: number },
  orientation: SymbolOrientation,
): { width: number; height: number } {
  if (orientation === 90 || orientation === 270) {
    return { width: bbox.height, height: bbox.width };
  }
  return { width: bbox.width, height: bbox.height };
}

// World point of a terminal: the outer connection tip, where wires snap on.
export function terminalWorld(
  node: Node<SldSymbolNodeData>,
  bbox: { width: number; height: number },
  terminal: Terminal,
): Point {
  const orientation = node.data.orientation ?? 0;
  const wrapper = wrapperDimensions(bbox, orientation);
  const dx = (terminal.xPct / 100) * wrapper.width - wrapper.width / 2;
  const dy = (terminal.yPct / 100) * wrapper.height - wrapper.height / 2;
  const [rx, ry] = rotateOffset(dx, dy, orientation);
  return {
    x: node.position.x + bbox.width / 2 + rx,
    y: node.position.y + bbox.height / 2 + ry,
  };
}

// World point where a lead meets the symbol body — the inner end of the
// terminal stub (vs `terminalWorld`'s outer tip).
export function leadBodyEndWorld(
  node: Node<SldSymbolNodeData>,
  bbox: { width: number; height: number },
  symbol: SymbolDef,
  terminal: Terminal,
): Point {
  const orientation = node.data.orientation ?? 0;
  const wrapper = wrapperDimensions(bbox, orientation);

  const bodyLeft = (wrapper.width - symbol.body.width) / 2;
  const bodyTop = (wrapper.height - symbol.body.height) / 2;
  const bodyRight = bodyLeft + symbol.body.width;
  const bodyBottom = bodyTop + symbol.body.height;

  const terminalX = (terminal.xPct / 100) * wrapper.width;
  const terminalY = (terminal.yPct / 100) * wrapper.height;
  let localX = terminalX;
  let localY = terminalY;
  switch (terminal.side) {
    case 'top':
      localY = bodyTop;
      break;
    case 'bottom':
      localY = bodyBottom;
      break;
    case 'left':
      localX = bodyLeft;
      break;
    case 'right':
      localX = bodyRight;
      break;
  }

  const dx = localX - wrapper.width / 2;
  const dy = localY - wrapper.height / 2;
  const [rx, ry] = rotateOffset(dx, dy, orientation);
  return {
    x: node.position.x + bbox.width / 2 + rx,
    y: node.position.y + bbox.height / 2 + ry,
  };
}

// Whether a lead runs horizontally once the symbol is rotated. A quarter turn
// (90/270) flips the lead's axis; a half turn (180) keeps it. Used to decide
// which way a snapped wire should extend.
export function leadIsHorizontalAfterRotation(
  terminal: Terminal,
  orientation: SymbolOrientation,
): boolean {
  const localHorizontal = terminal.side === 'left' || terminal.side === 'right';
  const quarterTurn = orientation === 90 || orientation === 270;
  return quarterTurn ? !localHorizontal : localHorizontal;
}

// Which physical side a terminal faces after rotation. Sides are listed
// clockwise, so a 90° turn advances one slot — orientation/90 = the step count.
export function terminalEffectiveSide(
  side: TerminalSide,
  orientation: SymbolOrientation,
): TerminalSide {
  const order: readonly TerminalSide[] = ['top', 'right', 'bottom', 'left'];
  const idx = order.indexOf(side);
  const steps = orientation / 90;
  return order[(idx + steps) % 4];
}

// Ports live in the bbox frame (not the rotation wrapper), so this accounts for the orientation baked into node.size.
export function terminalBboxPct(
  terminal: Terminal,
  bbox: { width: number; height: number },
  orientation: SymbolOrientation,
): { xPct: number; yPct: number } {
  const wrapper = wrapperDimensions(bbox, orientation);
  const dx = (terminal.xPct / 100) * wrapper.width - wrapper.width / 2;
  const dy = (terminal.yPct / 100) * wrapper.height - wrapper.height / 2;
  const [rx, ry] = rotateOffset(dx, dy, orientation);
  return {
    xPct: ((bbox.width / 2 + rx) / bbox.width) * 100,
    yPct: ((bbox.height / 2 + ry) / bbox.height) * 100,
  };
}

// Shared by the on-canvas renderer and the SVG exporter — keep them on this primitive so they cannot drift apart.
export function leadLocal(
  terminal: Terminal,
  wrapper: { width: number; height: number },
  body: { left: number; top: number; width: number; height: number },
): { x1: number; y1: number; x2: number; y2: number } {
  const terminalX = (terminal.xPct / 100) * wrapper.width;
  const terminalY = (terminal.yPct / 100) * wrapper.height;
  switch (terminal.side) {
    case 'top':
      return { x1: terminalX, y1: terminalY, x2: terminalX, y2: body.top };
    case 'bottom':
      return { x1: terminalX, y1: terminalY, x2: terminalX, y2: body.top + body.height };
    case 'left':
      return { x1: terminalX, y1: terminalY, x2: body.left, y2: terminalY };
    case 'right':
      return { x1: terminalX, y1: terminalY, x2: body.left + body.width, y2: terminalY };
  }
}

// Rotate an offset clockwise by the orientation (screen axes: y points down).
// Cases are the standard rotation matrix at 0/90/180/270 with the multiply-by-0/±1
// terms folded out, so no trig and no float error.
function rotateOffset(dx: number, dy: number, orientation: SymbolOrientation): [number, number] {
  switch (orientation) {
    case 0:
      return [dx, dy];
    case 90:
      return [-dy, dx];
    case 180:
      return [-dx, -dy];
    case 270:
      return [dy, -dx];
  }
}
