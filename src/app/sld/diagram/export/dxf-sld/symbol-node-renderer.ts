import type { Node, Point } from 'ng-diagram';
import type { SymbolDef, TerminalSide } from '../../../symbols/types';
import type { SldSymbolNodeData, SymbolOrientation } from '../../core/geometry/node-types';
import {
  leadBodyEndWorld,
  nodeOrientation,
  terminalEffectiveSide,
  terminalWorld,
} from '../../core/geometry/symbol-geometry';
import { DxfLwPolyline, DxfText } from '../dxf/dxf-entity';
import type { DxfNodeRenderer, DxfRenderContext } from '../dxf/dxf-types';
import {
  ELLIPSE_SEGMENTS,
  LAYERS,
  LINE_WEIGHT,
  TAG_FONT_SIZE,
  TAG_GAP,
  TEXT_STYLE,
} from './sld-dxf-constants';
import {
  parseSvgBody,
  type SvgPrimitive,
  type SvgTextAnchor,
  type SvgTextBaseline,
} from './svg-primitive-parser';

/**
 * Renders an SLD `sld-symbol` node into DXF entities, mirroring the on-screen
 * geometry produced by symbol-node.component and svg-export (svg-markup.ts):
 * a fixed-size symbol body centred in the node bbox, dynamic terminal leads
 * reaching the bbox edge, and an instance tag on the first free side. The
 * whole body+leads set rotates about the bbox centre with the node; the tag
 * stays horizontal.
 *
 * Body artwork lives in the symbol's own viewBox space, letterboxed into the
 * body box (SVG `preserveAspectRatio="xMidYMid meet"`, a uniform scale). Each
 * primitive is mapped viewBox → node-local px → world px (with rotation) →
 * DXF mm via `ctx.mapper`.
 *
 * `getSymbol` resolves the symbol definition by id — bound in sld-dxf-config so
 * the generic DxfRenderContext stays domain-free.
 */
export const createSymbolNodeRenderer =
  (getSymbol: (id: string) => SymbolDef | undefined): DxfNodeRenderer =>
  (ctx, node) => {
    const symbolNode = node as Node<SldSymbolNodeData>;
    const bbox = symbolNode.size;
    if (!bbox || bbox.width === 0 || bbox.height === 0) return;
    const def = getSymbol(symbolNode.data.symbolId);
    if (!def) return;

    const orientation = nodeOrientation(symbolNode);
    const vbToWorld = makeViewBoxToWorld(symbolNode, bbox, def, orientation);

    for (const primitive of parseSvgBody(def.svgBody)) {
      renderPrimitive(ctx, primitive, vbToWorld);
    }

    renderLeads(ctx, symbolNode, bbox, def);
    renderTag(ctx, symbolNode, bbox, def, orientation);
  };

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

type WorldMapper = (vx: number, vy: number) => Point;

/**
 * Builds the viewBox-px → world-px transform for a symbol's body artwork:
 * letterbox the viewBox into the centred body box (uniform "meet" scale),
 * then rotate the resulting node-local point about the bbox centre and
 * translate to world space — matching how the DOM nests a scaled <svg> inside
 * the rotated node.
 */
function makeViewBoxToWorld(
  node: Node<SldSymbolNodeData>,
  bbox: { width: number; height: number },
  def: SymbolDef,
  orientation: SymbolOrientation,
): WorldMapper {
  const bodyLeft = (bbox.width - def.body.width) / 2;
  const bodyTop = (bbox.height - def.body.height) / 2;
  const vb = def.bodyViewBox;
  const scale = Math.min(def.body.width / vb.width, def.body.height / vb.height);
  const contentWidth = vb.width * scale;
  const contentHeight = vb.height * scale;
  const offsetX = bodyLeft + (def.body.width - contentWidth) / 2;
  const offsetY = bodyTop + (def.body.height - contentHeight) / 2;

  return (vx, vy) => {
    const localX = offsetX + (vx - vb.x) * scale;
    const localY = offsetY + (vy - vb.y) * scale;
    return localToWorld(node, bbox, localX, localY, orientation);
  };
}

function localToWorld(
  node: Node<SldSymbolNodeData>,
  bbox: { width: number; height: number },
  localX: number,
  localY: number,
  orientation: SymbolOrientation,
): Point {
  const [rx, ry] = rotateOffset(localX - bbox.width / 2, localY - bbox.height / 2, orientation);
  return {
    x: node.position.x + bbox.width / 2 + rx,
    y: node.position.y + bbox.height / 2 + ry,
  };
}

// Rotate an offset clockwise by the orientation (screen axes: y points down).
// Mirrors the private helper in symbol-geometry.ts so the body artwork rotates
// exactly as the leads (which reuse that module's terminalWorld/leadBodyEndWorld).
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

// ---------------------------------------------------------------------------
// Primitive rendering
// ---------------------------------------------------------------------------

function renderPrimitive(
  ctx: DxfRenderContext,
  primitive: SvgPrimitive,
  vbToWorld: WorldMapper,
): void {
  switch (primitive.kind) {
    case 'line':
      addPolyline(
        ctx,
        [vbToWorld(primitive.x1, primitive.y1), vbToWorld(primitive.x2, primitive.y2)],
        false,
      );
      break;
    case 'rect': {
      const { x, y, width, height } = primitive;
      addPolyline(
        ctx,
        [
          vbToWorld(x, y),
          vbToWorld(x + width, y),
          vbToWorld(x + width, y + height),
          vbToWorld(x, y + height),
        ],
        true,
      );
      break;
    }
    case 'polygon':
      if (primitive.points.length >= 2) {
        addPolyline(
          ctx,
          primitive.points.map((point) => vbToWorld(point.x, point.y)),
          true,
        );
      }
      break;
    case 'ellipse':
      addPolyline(ctx, ellipseWorldPoints(primitive, vbToWorld), true);
      break;
    case 'text':
      renderBodyText(ctx, primitive, vbToWorld);
      break;
  }
}

function addPolyline(ctx: DxfRenderContext, worldPoints: readonly Point[], closed: boolean): void {
  const mapped = worldPoints.map((point) => ctx.mapper.mapPoint(point.x, point.y));
  ctx.doc.addEntity(
    new DxfLwPolyline(LAYERS.SYMBOLS, mapped, closed, undefined, LINE_WEIGHT.SYMBOL),
  );
}

function ellipseWorldPoints(
  ellipse: { cx: number; cy: number; rx: number; ry: number },
  vbToWorld: WorldMapper,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / ELLIPSE_SEGMENTS;
    points.push(
      vbToWorld(ellipse.cx + ellipse.rx * Math.cos(angle), ellipse.cy + ellipse.ry * Math.sin(angle)),
    );
  }
  return points;
}

function renderBodyText(
  ctx: DxfRenderContext,
  text: { x: number; y: number; text: string; fontSize: number; anchor: SvgTextAnchor; baseline: SvgTextBaseline },
  vbToWorld: WorldMapper,
): void {
  if (!text.text) return;
  const anchorWorld = vbToWorld(text.x, text.y);
  // The body scale is uniform, so a single mapped viewBox-length gives the
  // text height in mm. Compare two points one viewBox-unit apart on the x axis.
  const oneUnit = vbToWorld(text.x + 1, text.y);
  const scaleWorldPerVb = Math.hypot(oneUnit.x - anchorWorld.x, oneUnit.y - anchorWorld.y);
  const heightMm = ctx.mapper.mapLength(text.fontSize * scaleWorldPerVb);
  const anchor = ctx.mapper.mapPoint(anchorWorld.x, anchorWorld.y);
  ctx.doc.addEntity(
    new DxfText(
      LAYERS.SYMBOLS,
      text.text,
      anchor.x,
      anchor.y,
      heightMm,
      TEXT_STYLE.STANDARD,
      halignOf(text.anchor),
      valignOf(text.baseline),
    ),
  );
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

// Each terminal's lead is the world segment from where it meets the body edge
// (`leadBodyEndWorld`) to its outer connection tip (`terminalWorld`) — the same
// two rotation-aware endpoints the canvas and SVG export use.
function renderLeads(
  ctx: DxfRenderContext,
  node: Node<SldSymbolNodeData>,
  bbox: { width: number; height: number },
  def: SymbolDef,
): void {
  for (const terminal of def.terminals) {
    const inner = leadBodyEndWorld(node, bbox, def, terminal);
    const outer = terminalWorld(node, bbox, terminal);
    ctx.doc.addEntity(
      new DxfLwPolyline(
        LAYERS.SYMBOLS,
        [ctx.mapper.mapPoint(inner.x, inner.y), ctx.mapper.mapPoint(outer.x, outer.y)],
        false,
        undefined,
        LINE_WEIGHT.LEAD,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Instance tag
// ---------------------------------------------------------------------------

// Places the tag on the first side free of a terminal (right → bottom → left →
// top), just outside the rotated footprint, horizontal — mirroring
// computeTagSide/computeTagPosition in svg-markup.ts. The tag sits outside the
// symbol's rotation, so its world anchor is simply node.position + local pos.
function renderTag(
  ctx: DxfRenderContext,
  node: Node<SldSymbolNodeData>,
  bbox: { width: number; height: number },
  def: SymbolDef,
  orientation: SymbolOrientation,
): void {
  const tag = node.data.properties['tag'];
  if (typeof tag !== 'string' || !tag) return;

  const side = tagSide(def, orientation);
  const pos = tagPosition(side, bbox, orientation);
  const anchor = ctx.mapper.mapPoint(node.position.x + pos.x, node.position.y + pos.y);
  const heightMm = ctx.mapper.mapLength(TAG_FONT_SIZE);
  ctx.doc.addEntity(
    new DxfText(
      LAYERS.SYMBOLS,
      tag,
      anchor.x,
      anchor.y,
      heightMm,
      TEXT_STYLE.BOLD,
      halignOf(pos.anchor),
      valignOf(pos.baseline),
    ),
  );
}

function tagSide(def: SymbolDef, orientation: SymbolOrientation): TerminalSide {
  const occupied = new Set<TerminalSide>(
    def.terminals.map((terminal) => terminalEffectiveSide(terminal.side, orientation)),
  );
  const priority: readonly TerminalSide[] = ['right', 'bottom', 'left', 'top'];
  return priority.find((candidate) => !occupied.has(candidate)) ?? 'right';
}

function tagPosition(
  side: TerminalSide,
  bbox: { width: number; height: number },
  orientation: SymbolOrientation,
): { x: number; y: number; anchor: SvgTextAnchor; baseline: SvgTextBaseline } {
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

// ---------------------------------------------------------------------------
// SVG text alignment → DXF justification
// ---------------------------------------------------------------------------

// DXF TEXT halign: 0=left, 1=center, 2=right.
function halignOf(anchor: SvgTextAnchor): 0 | 1 | 2 {
  return anchor === 'middle' ? 1 : anchor === 'end' ? 2 : 0;
}

// DXF TEXT valign: 0=baseline, 1=bottom, 2=middle, 3=top.
// SVG 'alphabetic' is the text baseline (0); 'central' the middle (2);
// 'hanging' the top (3).
function valignOf(baseline: SvgTextBaseline): 0 | 1 | 2 | 3 {
  return baseline === 'central' ? 2 : baseline === 'hanging' ? 3 : 0;
}
