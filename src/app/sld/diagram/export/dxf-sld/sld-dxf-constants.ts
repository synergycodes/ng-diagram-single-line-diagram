export const LAYERS = {
  SYMBOLS: 'SYMBOLS',
  LINKS: 'LINKS',
  // Control links carry the same geometry as power links; a dedicated layer is
  // how their kind survives into CAD, where the on-screen dash (a rendering
  // style) has no equivalent unless a custom linetype is defined. Keeping the
  // vendored DXF skeleton untouched, layer separation is the faithful handoff.
  LINKS_CONTROL: 'LINKS_CONTROL',
  JUNCTIONS: 'JUNCTIONS',
} as const;

export const ACI = {
  WHITE: 7,
} as const;

export const TEXT_STYLE = {
  STANDARD: 'STANDARD',
  BOLD: 'BOLD',
} as const;

/**
 * Lineweights in 1/100 mm (DXF group code 370). Must use values from the
 * DXF standard lineweight enum: 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, ...
 */
export const LINE_WEIGHT = {
  SYMBOL: 25,
  LEAD: 25,
  LINK: 35,
  JUNCTION: 25,
} as const;

/** Conversion factor: DXF millimetres per one diagram unit. Fixed (no paper fitting). */
export const DXF_SCALE_MM_PER_PX = 0.3;

/** Padding around the diagram in diagram units. Mirrors the SVG export's MARGIN. */
export const DIAGRAM_PADDING = 32;

/** Junction dot radius in diagram units. Mirrors JUNCTION_RADIUS in svg-markup.ts. */
export const JUNCTION_RADIUS = 3;

/** Instance-tag font size in diagram units. Mirrors TAG_FONT_SIZE in svg-markup.ts. */
export const TAG_FONT_SIZE = 10;

/** Gap between a symbol's rotated footprint and its tag. Mirrors TAG_GAP in svg-markup.ts. */
export const TAG_GAP = 6;

/**
 * Segment count used to approximate a circle/ellipse as a closed LWPOLYLINE.
 * The vendored DXF library ships only LWPOLYLINE + TEXT entities; a 48-gon is
 * visually indistinguishable from a true CIRCLE at symbol scale and needs no
 * change to the proven serializer.
 */
export const ELLIPSE_SEGMENTS = 48;
