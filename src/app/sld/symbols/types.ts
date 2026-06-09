export type SymbolCategory =
  | 'wires'
  | 'switchgear'
  | 'transformers'
  | 'measurement'
  | 'protection'
  | 'sources-loads'
  | 'compensation';

export type VoltageTier = 'lv' | 'mv' | 'hv' | 'ehv' | 'dc';

export type TerminalSide = 'top' | 'right' | 'bottom' | 'left';

/** `power` = solid stroke (IEC 60617 main circuit). `control` = dashed stroke
 *  (signalling / interlock). Links connect only between same-kind terminals. */
export type LinkKind = 'power' | 'control';

export interface Terminal {
  readonly id: string;
  readonly side: TerminalSide;
  readonly xPct: number;
  readonly yPct: number;
  /** Defaults to `power` when omitted in the generated registry. */
  readonly kind?: LinkKind;
}

export type PropertyType = 'text' | 'number' | 'select';

export interface PropertyDef {
  readonly key: string;
  readonly label: string;
  readonly type: PropertyType;
  readonly unit?: string;
  readonly options?: readonly string[];
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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
