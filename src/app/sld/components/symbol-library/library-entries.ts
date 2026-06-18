import type { SafeHtml } from '@angular/platform-browser';
import type { BasePaletteItemData, NgDiagramPaletteItem } from 'ng-diagram';
import { CONTROL_DASHARRAY, STROKE_WIDTH } from '../../diagram/core/geometry/constants';
import {
  SLD_SYMBOL_NODE_TYPE,
  type SldSymbolNodeData,
} from '../../diagram/core/geometry/node-types';
import { leadLocal } from '../../diagram/core/geometry/symbol-geometry';
import type { SymbolCategory, SymbolDef } from '../../symbols/types';

// Builds the palette entries the symbol library renders: a standalone SVG
// preview plus the NgDiagramPaletteItem that seeds the node when dropped.

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
  switchgear: 'Switchgear',
  transformers: 'Transformers',
  measurement: 'Measurement',
  protection: 'Protection',
  'sources-loads': 'Sources & loads',
  compensation: 'Compensation',
};

// Display order of categories in the palette (the labels record above is
// keyed, so order lives here). Entries with no symbols are dropped.
export const CATEGORY_ORDER: readonly SymbolCategory[] = [
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
      // Fixed footprint, free quarter-turn rotation (ng-diagram's native angle).
      rotatable: true,
    },
  };
}
