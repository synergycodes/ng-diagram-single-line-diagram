// Shape of a symbol definition and its supporting types. A SymbolDef is the
// blueprint the palette, properties panel, and diagram all read from; the
// generated registry produces these and the rest of the app only consumes them.

// Palette groupings, modelled on IEC 60617 equipment families.
export type SymbolCategory =
  | 'wires'
  | 'switchgear'
  | 'transformers'
  | 'measurement'
  | 'protection'
  | 'sources-loads'
  | 'compensation';

// Voltage class, used for filtering and styling (low/medium/high/extra-high/DC).
export type VoltageTier = 'lv' | 'mv' | 'hv' | 'ehv' | 'dc';

export type TerminalSide = 'top' | 'right' | 'bottom' | 'left';

/** `power` = solid stroke (IEC 60617 main circuit). `control` = dashed stroke
 *  (signalling / interlock). Links connect only between same-kind terminals. */
export type LinkKind = 'power' | 'control';

// A connection point on a symbol. Position is given as a percentage of the body
// box so it stays correct at any display size.
export interface Terminal {
  readonly id: string;
  readonly side: TerminalSide;
  readonly xPct: number;
  readonly yPct: number;
  /** Defaults to `power` when omitted in the generated registry. */
  readonly kind?: LinkKind;
}

export type PropertyType = 'text' | 'number' | 'select';

// One editable field in the properties panel, driving the Formly form.
export interface PropertyDef {
  readonly key: string;
  readonly label: string;
  readonly type: PropertyType;
  readonly unit?: string;
  readonly options?: readonly string[];
}

// SVG viewBox for the symbol body, mirroring the source artwork's coordinates.
export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// The complete definition of one symbol: identity, classification, geometry,
// artwork, terminals, and its editable data/schema.
export interface SymbolDef {
  readonly id: string;
  readonly label: string;
  readonly category: SymbolCategory;
  readonly voltageTier: VoltageTier;
  readonly displaySize: { readonly width: number; readonly height: number };
  // Body stays fixed-size centred in the bbox; resize only changes lead length.
  readonly body: { readonly width: number; readonly height: number };
  readonly bodyViewBox: ViewBox;
  // BODY only — leads are rendered dynamically from terminal positions.
  readonly svgBody: string;
  readonly terminals: readonly Terminal[];
  readonly defaultData: Readonly<Record<string, string | number | boolean>>;
  readonly propertySchema: readonly PropertyDef[];
}
