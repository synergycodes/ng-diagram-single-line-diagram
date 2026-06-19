import type { Edge, Node, Point } from 'ng-diagram';
import type { SymbolDef, TerminalSide } from '../../symbols/types';
import { CONTROL_DASHARRAY, STROKE_WIDTH } from '../core/geometry/constants';
import {
  edgeKind,
  type SldSymbolNodeData,
  type SymbolOrientation,
} from '../core/geometry/node-types';
import {
  leadLocal,
  nodeOrientation,
  terminalEffectiveSide,
} from '../core/geometry/symbol-geometry';

// SVG-string builders for SvgExportService. No DI and no model access — every
// input is passed in, so each builder is a plain function of its arguments.

// Body primitives are emitted by `build-symbols.mjs` with vector-effect="non-scaling-stroke".
// Apply the same effect to leads/edges so the whole drawing keeps a uniform
// stroke weight when the SVG is rendered at non-1:1 zoom in Illustrator/Inkscape.
const NON_SCALING = 'vector-effect="non-scaling-stroke"';

// Blank border around the drawing's bounds, in world px.
const MARGIN = 32;
const JUNCTION_RADIUS = 3;
const TAG_GAP = 6;
const TAG_FONT_SIZE = 10;
// Ink for the standalone file (CSS vars don't survive export) — DS gray-800.
const INK = '#151516';

export interface WorldBbox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

// Emit a symbol as its body SVG plus terminal leads, rotated about the bbox
// centre to match the on-screen orientation, with the tag kept horizontal.
// `def` is the resolved symbol; returns '' when it or the node size is missing.
export function renderSymbolNode(
  node: Node<SldSymbolNodeData>,
  def: SymbolDef | undefined,
): string {
  if (!def || !node.size) return '';

  const orientation = nodeOrientation(node);
  const bbox = node.size;
  const bodyLeft = (bbox.width - def.body.width) / 2;
  const bodyTop = (bbox.height - def.body.height) / 2;

  const viewBox = def.bodyViewBox;
  const bodyEl =
    `<svg x="${fmt(bodyLeft)}" y="${fmt(bodyTop)}" ` +
    `width="${def.body.width}" height="${def.body.height}" ` +
    `viewBox="${fmt(viewBox.x)} ${fmt(viewBox.y)} ${fmt(viewBox.width)} ${fmt(viewBox.height)}" ` +
    `preserveAspectRatio="xMidYMid meet" overflow="visible">${def.svgBody}</svg>`;

  const leadEls: string[] = [];
  for (const terminal of def.terminals) {
    const lead = leadLocal(terminal, bbox, {
      left: bodyLeft,
      top: bodyTop,
      width: def.body.width,
      height: def.body.height,
    });
    const dash = terminal.kind === 'control' ? ` stroke-dasharray="${CONTROL_DASHARRAY}"` : '';
    leadEls.push(
      `<line x1="${fmt(lead.x1)}" y1="${fmt(lead.y1)}" ` +
        `x2="${fmt(lead.x2)}" y2="${fmt(lead.y2)}" ${NON_SCALING}${dash}/>`,
    );
  }

  // Rotate around bbox centre so the rotated extent fills the bbox.
  let inner = bodyEl + leadEls.join('');
  if (orientation !== 0) {
    const cx = bbox.width / 2;
    const cy = bbox.height / 2;
    inner = `<g transform="rotate(${orientation} ${fmt(cx)} ${fmt(cy)})">${inner}</g>`;
  }

  // Tag stays outside the rotation group so it remains horizontal.
  const tagText = readTag(node.data);
  let tagEl = '';
  if (tagText) {
    const side = computeTagSide(def, orientation);
    const pos = computeTagPosition(side, bbox, orientation);
    tagEl =
      `<text x="${fmt(pos.x)}" y="${fmt(pos.y)}" text-anchor="${pos.anchor}" ` +
      `dominant-baseline="${pos.baseline}" font-size="${TAG_FONT_SIZE}" font-weight="600" ` +
      `fill="${INK}" stroke="none">${escapeXml(tagText)}</text>`;
  }

  return `<g transform="translate(${fmt(node.position.x)} ${fmt(node.position.y)})">${inner}${tagEl}</g>`;
}

// Edge line, dashed for control links to match the on-canvas style.
export function renderEdge(edge: Edge): string {
  const points = edge.points;
  if (!points || points.length < 2) return '';
  const polyPoints = points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const dash = edgeKind(edge) === 'control' ? ` stroke-dasharray="${CONTROL_DASHARRAY}"` : '';
  return `<polyline points="${polyPoints}" ${NON_SCALING}${dash}/>`;
}

export function renderJunctionDot(point: Point): string {
  return `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="${JUNCTION_RADIUS}" fill="${INK}" stroke="none"/>`;
}

// Null when the model is empty.
export function computeWorldBbox(nodes: readonly Node[], edges: readonly Edge[]): WorldBbox | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let any = false;
  for (const node of nodes) {
    if (!node.size) continue;
    any = true;
    const extent = rotatedNodeExtent(node, node.size);
    minX = Math.min(minX, extent.left);
    minY = Math.min(minY, extent.top);
    maxX = Math.max(maxX, extent.right);
    maxY = Math.max(maxY, extent.bottom);
  }
  // Dangling edges can extend past the node bbox — include their points so the
  // viewBox doesn't clip the trailing edge.
  for (const edge of edges) {
    if (!edge.points) continue;
    for (const point of edge.points) {
      any = true;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

// A node's world-space extent accounting for rotation: a quarter turn
// swaps the footprint, so the rotated bounding box is centred on the node
// centre with width/height swapped.
function rotatedNodeExtent(
  node: Node,
  size: { width: number; height: number },
): { left: number; top: number; right: number; bottom: number } {
  const quarterTurn = nodeOrientation(node) === 90 || nodeOrientation(node) === 270;
  const w = quarterTurn ? size.height : size.width;
  const h = quarterTurn ? size.width : size.height;
  const cx = node.position.x + size.width / 2;
  const cy = node.position.y + size.height / 2;
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

// Wrap the painted elements in a standalone <svg> document: viewBox padded by
// MARGIN, shared stroke/font defaults so individual elements stay terse.
export function wrapSvgDocument(elements: readonly string[], bbox: WorldBbox): string {
  const viewX = bbox.minX - MARGIN;
  const viewY = bbox.minY - MARGIN;
  const viewW = bbox.maxX - bbox.minX + 2 * MARGIN;
  const viewH = bbox.maxY - bbox.minY + 2 * MARGIN;

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(viewX)} ${fmt(viewY)} ${fmt(viewW)} ${fmt(viewH)}" ` +
      `fill="none" stroke="${INK}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" ` +
      `font-family="'Geist Mono', ui-monospace, 'SF Mono', monospace">`,
    ...elements.filter((element) => element.length > 0),
    `</svg>`,
  ].join('\n');
}

export function emptySvg(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>`
  );
}

// Place the tag on the first side (right → bottom → left → top) free of a
// terminal, so the label doesn't overlap a lead. Falls back to 'right'.
function computeTagSide(def: SymbolDef, orientation: SymbolOrientation): TerminalSide {
  const occupied = new Set<TerminalSide>(
    def.terminals.map((terminal) => terminalEffectiveSide(terminal.side, orientation)),
  );
  const priority: readonly TerminalSide[] = ['right', 'bottom', 'left', 'top'];
  return priority.find((side) => !occupied.has(side)) ?? 'right';
}

// Tag anchor point + text-anchor/baseline for the chosen side, offset by
// TAG_GAP. `side` is the post-rotation (effective) side; the tag sits just
// outside the rotated footprint (width/height swap for quarter turns), centred
// on the bbox centre so it lines up with the rotated symbol.
function computeTagPosition(
  side: TerminalSide,
  bbox: { width: number; height: number },
  orientation: SymbolOrientation,
): {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  baseline: 'central' | 'hanging' | 'alphabetic';
} {
  const quarterTurn = orientation === 90 || orientation === 270;
  const footprintW = quarterTurn ? bbox.height : bbox.width;
  const footprintH = quarterTurn ? bbox.width : bbox.height;
  const cx = bbox.width / 2;
  const cy = bbox.height / 2;
  switch (side) {
    case 'right':
      return { x: cx + footprintW / 2 + TAG_GAP, y: cy, anchor: 'start', baseline: 'central' };
    case 'left':
      return { x: cx - footprintW / 2 - TAG_GAP, y: cy, anchor: 'end', baseline: 'central' };
    case 'bottom':
      return { x: cx, y: cy + footprintH / 2 + TAG_GAP, anchor: 'middle', baseline: 'hanging' };
    case 'top':
      return { x: cx, y: cy - footprintH / 2 - TAG_GAP, anchor: 'middle', baseline: 'alphabetic' };
  }
}

function readTag(data: SldSymbolNodeData): string {
  const tag = data.properties['tag'];
  return typeof tag === 'string' ? tag : '';
}

// Escape user-entered tag text before interpolating it into the SVG markup.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format a coordinate for the SVG: round to 3 decimals to drop float noise and
// keep the output compact (e.g. 12.0000001 → "12").
function fmt(value: number): string {
  const rounded = +value.toFixed(3);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
