import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, type Edge, type Node, type Point } from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import type { SymbolDef, TerminalSide } from '../../symbols/types';
import { ConnectivityService } from '../connectivity/connectivity.service';
import { CONTROL_DASHARRAY, STROKE_WIDTH } from '../geometry/constants';
import {
  edgeKind,
  isSymbolNode,
  isWireNode,
  type SldSymbolNodeData,
  type SldWireNodeData,
  type SymbolOrientation,
} from '../geometry/node-types';
import { leadLocal, terminalEffectiveSide, wrapperDimensions } from '../geometry/symbol-geometry';

// Body primitives are emitted by `build-symbols.mjs` with vector-effect="non-scaling-stroke".
// Apply the same effect to leads/wires/edges so the whole drawing keeps a uniform
// stroke weight when the SVG is rendered at non-1:1 zoom in Illustrator/Inkscape.
const NON_SCALING = 'vector-effect="non-scaling-stroke"';

const MARGIN = 32;
const JUNCTION_RADIUS = 3;
const TAG_GAP = 6;
const TAG_FONT_SIZE = 10;
// Ink for the standalone file (CSS vars don't survive export) — DS gray-800.
const INK = '#151516';

// Builds an editable vector SVG directly from the model — html-to-image's
// foreignObject output is not round-trippable through Illustrator/Inkscape.
@Injectable()
export class SvgExportService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);
  private readonly connectivity = inject(ConnectivityService);

  exportToSvg(): string {
    const nodes = this.modelService.nodes();
    const edges = this.modelService.edges();
    const bbox = this.computeWorldBbox(nodes, edges);
    if (!bbox) return this.emptySvg();

    const elements: string[] = [];
    // Edges first so they sit under symbol bodies — symbols cap edges visually
    // at their bbox edge, which is what the router already targets.
    for (const edge of edges) {
      const rendered = this.renderEdge(edge);
      if (rendered) elements.push(rendered);
    }
    for (const node of nodes) {
      if (isSymbolNode(node)) {
        elements.push(this.renderSymbolNode(node));
      } else if (isWireNode(node)) {
        elements.push(this.renderWireNode(node));
      }
    }

    // Drawn last so they sit on top of overlapping wire ends.
    for (const junction of this.connectivity.junctions()) {
      elements.push(
        `<circle cx="${fmt(junction.x)}" cy="${fmt(junction.y)}" r="${JUNCTION_RADIUS}" fill="${INK}" stroke="none"/>`,
      );
    }

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

  private renderSymbolNode(node: Node<SldSymbolNodeData>): string {
    const def = this.registry.getById(node.data.symbolId);
    if (!def || !node.size) return '';

    const orientation = (node.data.orientation ?? 0) as SymbolOrientation;
    const bbox = node.size;
    const wrap = wrapperDimensions(bbox, orientation);
    const wrapperLeft = (bbox.width - wrap.width) / 2;
    const wrapperTop = (bbox.height - wrap.height) / 2;
    const bodyLeft = (wrap.width - def.body.width) / 2;
    const bodyTop = (wrap.height - def.body.height) / 2;

    const viewBox = def.bodyViewBox;
    const bodyEl =
      `<svg x="${fmt(wrapperLeft + bodyLeft)}" y="${fmt(wrapperTop + bodyTop)}" ` +
      `width="${def.body.width}" height="${def.body.height}" ` +
      `viewBox="${fmt(viewBox.x)} ${fmt(viewBox.y)} ${fmt(viewBox.width)} ${fmt(viewBox.height)}" ` +
      `preserveAspectRatio="xMidYMid meet" overflow="visible">${def.svgBody}</svg>`;

    const leadEls: string[] = [];
    for (const terminal of def.terminals) {
      const lead = leadLocal(terminal, wrap, {
        left: bodyLeft,
        top: bodyTop,
        width: def.body.width,
        height: def.body.height,
      });
      const dash = terminal.kind === 'control' ? ` stroke-dasharray="${CONTROL_DASHARRAY}"` : '';
      leadEls.push(
        `<line x1="${fmt(wrapperLeft + lead.x1)}" y1="${fmt(wrapperTop + lead.y1)}" ` +
          `x2="${fmt(wrapperLeft + lead.x2)}" y2="${fmt(wrapperTop + lead.y2)}" ${NON_SCALING}${dash}/>`,
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
      const pos = computeTagPosition(side, bbox);
      tagEl =
        `<text x="${fmt(pos.x)}" y="${fmt(pos.y)}" text-anchor="${pos.anchor}" ` +
        `dominant-baseline="${pos.baseline}" font-size="${TAG_FONT_SIZE}" font-weight="600" ` +
        `fill="${INK}" stroke="none">${escapeXml(tagText)}</text>`;
    }

    return `<g transform="translate(${fmt(node.position.x)} ${fmt(node.position.y)})">${inner}${tagEl}</g>`;
  }

  private renderWireNode(node: Node<SldWireNodeData>): string {
    if (!node.size) return '';
    const horizontal = node.data.orientation === 'horizontal';
    const start: Point = horizontal
      ? { x: 0, y: node.size.height / 2 }
      : { x: node.size.width / 2, y: 0 };
    const end: Point = horizontal
      ? { x: node.size.width, y: start.y }
      : { x: start.x, y: node.size.height };
    return (
      `<g transform="translate(${fmt(node.position.x)} ${fmt(node.position.y)})">` +
      `<line x1="${fmt(start.x)}" y1="${fmt(start.y)}" x2="${fmt(end.x)}" y2="${fmt(end.y)}" ${NON_SCALING}/></g>`
    );
  }

  private renderEdge(edge: Edge): string {
    const points = edge.points;
    if (!points || points.length < 2) return '';
    const polyPoints = points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
    const dash = edgeKind(edge) === 'control' ? ` stroke-dasharray="${CONTROL_DASHARRAY}"` : '';
    return `<polyline points="${polyPoints}" ${NON_SCALING}${dash}/>`;
  }

  private computeWorldBbox(
    nodes: readonly Node[],
    edges: readonly Edge[],
  ): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let any = false;
    for (const node of nodes) {
      if (!node.size) continue;
      any = true;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.size.width);
      maxY = Math.max(maxY, node.position.y + node.size.height);
    }
    // Dangling edges can extend past the node bbox — include their points so the
    // viewBox doesn't clip the trailing wire.
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

  private emptySvg(): string {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>`
    );
  }
}

function computeTagSide(def: SymbolDef, orientation: SymbolOrientation): TerminalSide {
  const occupied = new Set<TerminalSide>(
    def.terminals.map((terminal) => terminalEffectiveSide(terminal.side, orientation)),
  );
  const priority: readonly TerminalSide[] = ['right', 'bottom', 'left', 'top'];
  return priority.find((side) => !occupied.has(side)) ?? 'right';
}

function computeTagPosition(
  side: TerminalSide,
  bbox: { width: number; height: number },
): {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  baseline: 'central' | 'hanging' | 'alphabetic';
} {
  switch (side) {
    case 'right':
      return { x: bbox.width + TAG_GAP, y: bbox.height / 2, anchor: 'start', baseline: 'central' };
    case 'left':
      return { x: -TAG_GAP, y: bbox.height / 2, anchor: 'end', baseline: 'central' };
    case 'bottom':
      return { x: bbox.width / 2, y: bbox.height + TAG_GAP, anchor: 'middle', baseline: 'hanging' };
    case 'top':
      return { x: bbox.width / 2, y: -TAG_GAP, anchor: 'middle', baseline: 'alphabetic' };
  }
}

function readTag(data: SldSymbolNodeData): string {
  const tag = data.properties['tag'];
  return typeof tag === 'string' ? tag : '';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt(value: number): string {
  const rounded = +value.toFixed(3);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
