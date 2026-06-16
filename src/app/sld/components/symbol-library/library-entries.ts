import type { SafeHtml } from '@angular/platform-browser';
import type { BasePaletteItemData, NgDiagramPaletteItem } from 'ng-diagram';
import { CONTROL_DASHARRAY, STROKE_WIDTH } from '../../diagram/core/geometry/constants';
import {
  SLD_SYMBOL_NODE_TYPE,
  SLD_WIRE_NODE_TYPE,
  WIRE_DEFAULT_LENGTH_PX,
  WIRE_THICKNESS_PX,
  type SldSymbolNodeData,
  type SldWireNodeData,
} from '../../diagram/core/geometry/node-types';
import { leadLocal } from '../../diagram/core/geometry/symbol-geometry';
import type { SymbolCategory, SymbolDef } from '../../symbols/types';

// Builds the palette entries the symbol library renders: a standalone SVG
// preview plus the NgDiagramPaletteItem that seeds the node when dropped. The
// preview/SVG is purely derived from the symbol definition.

export interface LibraryEntry {
  readonly id: string;
  readonly label: string;
  readonly category: SymbolCategory;
  readonly paletteItem: NgDiagramPaletteItem;
  readonly svgHtml: SafeHtml;
  readonly previewSize: { readonly width: number; readonly height: number };
}

export interface CategoryGroup {
  readonly id: SymbolCategory;
  readonly label: string;
  readonly entries: readonly LibraryEntry[];
}

export const CATEGORY_LABELS: Record<SymbolCategory, string> = {
  wires: 'Wires',
  switchgear: 'Switchgear',
  transformers: 'Transformers',
  measurement: 'Measurement',
  protection: 'Protection',
  'sources-loads': 'Sources & loads',
  compensation: 'Compensation',
};

// Display order of categories in the palette (the labels record above is
// keyed, so order lives here). Wires lead; entries with no symbols are dropped.
export const CATEGORY_ORDER: readonly SymbolCategory[] = [
  'wires',
  'switchgear',
  'transformers',
  'measurement',
  'protection',
  'sources-loads',
  'compensation',
];

type Sanitize = (svg: string) => SafeHtml;

// One palette entry for a symbol definition: composes the body SVG with its
// lead lines into a single preview, and the matching drop payload.
export function buildSymbolEntry(def: SymbolDef, sanitize: Sanitize): LibraryEntry {
  // Preview = full displaySize bbox with leads drawn explicitly so the drag
  // ghost matches the on-canvas symbol. PREVIEW_PADDING absorbs half-stroke
  // overshoot — Chromium's `setDragImage` clips to the layout box, not
  // painted overflow, which would lop strokes off body-flush symbols.
  const PREVIEW_PADDING = 2;
  const wrapper = { width: def.displaySize.width, height: def.displaySize.height };
  const previewWidth = wrapper.width + 2 * PREVIEW_PADDING;
  const previewHeight = wrapper.height + 2 * PREVIEW_PADDING;
  const bodyLeft = (wrapper.width - def.body.width) / 2;
  const bodyTop = (wrapper.height - def.body.height) / 2;
  const bodyBox = { left: bodyLeft, top: bodyTop, width: def.body.width, height: def.body.height };

  const viewBox = def.bodyViewBox;
  const bodySvg =
    `<svg x="${bodyLeft}" y="${bodyTop}" width="${def.body.width}" height="${def.body.height}" ` +
    `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" ` +
    `preserveAspectRatio="xMidYMid meet" overflow="visible">${def.svgBody}</svg>`;

  const leadLines = def.terminals
    .map((terminal) => {
      const lead = leadLocal(terminal, wrapper, bodyBox);
      const dash = terminal.kind === 'control' ? ` stroke-dasharray="${CONTROL_DASHARRAY}"` : '';
      return `<line x1="${lead.x1}" y1="${lead.y1}" x2="${lead.x2}" y2="${lead.y2}" stroke-width="${STROKE_WIDTH}"${dash}/>`;
    })
    .join('');

  // SVG attrs (not CSS) for width/height/overflow so they survive ng-diagram's
  // clone-into-body trick for `setDragImage` — `:host ::ng-deep` doesn't match
  // outside <app-symbol-library>.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="${-PREVIEW_PADDING} ${-PREVIEW_PADDING} ${previewWidth} ${previewHeight}" ` +
    `width="${previewWidth}" height="${previewHeight}" ` +
    `preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" overflow="visible">` +
    `${bodySvg}${leadLines}</svg>`;

  // NgDiagramPaletteItem.data is typed as BasePaletteItemData ({ label }) — extra fields
  // are stripped at compile time but preserved at runtime. Widen via cast at the boundary.
  const data: SldSymbolNodeData & BasePaletteItemData = {
    label: def.label,
    symbolId: def.id,
    orientation: 0,
    properties: { ...def.defaultData },
  };

  return {
    id: def.id,
    label: def.label,
    category: def.category,
    svgHtml: sanitize(svg),
    // Padded preview; drop size below stays at displaySize.
    previewSize: { width: previewWidth, height: previewHeight },
    paletteItem: {
      type: SLD_SYMBOL_NODE_TYPE,
      data: data as BasePaletteItemData,
      size: { width: def.displaySize.width, height: def.displaySize.height },
      autoSize: false,
      resizable: true,
      // node.angle hides the resize adornment — rotate via data.orientation + CSS transform instead.
      rotatable: false,
    },
  };
}

// The two built-in wire palette entries (horizontal + vertical).
export function buildWireEntries(sanitize: Sanitize): readonly LibraryEntry[] {
  return [buildWireEntry('horizontal', sanitize), buildWireEntry('vertical', sanitize)];
}

// A single straight-line wire entry; orientation just swaps width/height.
function buildWireEntry(orientation: 'horizontal' | 'vertical', sanitize: Sanitize): LibraryEntry {
  const isHorizontal = orientation === 'horizontal';
  const length = WIRE_DEFAULT_LENGTH_PX;
  const thickness = WIRE_THICKNESS_PX;
  const width = isHorizontal ? length : thickness;
  const height = isHorizontal ? thickness : length;

  // overflow="visible" — see comment in buildSymbolEntry; same reason.
  const svg = isHorizontal
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${length} ${thickness}" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" overflow="visible">` +
      `<line x1="0" y1="${thickness / 2}" x2="${length}" y2="${thickness / 2}" stroke-width="${STROKE_WIDTH}"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${thickness} ${length}" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" overflow="visible">` +
      `<line x1="${thickness / 2}" y1="0" x2="${thickness / 2}" y2="${length}" stroke-width="${STROKE_WIDTH}"/></svg>`;

  const id = `wire-${orientation}`;
  const data: SldWireNodeData & BasePaletteItemData = {
    label: isHorizontal ? 'Horizontal wire' : 'Vertical wire',
    orientation,
  };

  return {
    id,
    label: data.label,
    category: 'wires',
    svgHtml: sanitize(svg),
    previewSize: { width, height },
    paletteItem: {
      type: SLD_WIRE_NODE_TYPE,
      data: data as BasePaletteItemData,
      size: { width, height },
      autoSize: false,
      resizable: true,
      rotatable: false,
    },
  };
}
