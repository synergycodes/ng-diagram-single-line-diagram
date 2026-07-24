// Parses a symbol's `svgBody` string (from the generated registry) into a flat
// list of drawing primitives in the symbol's own viewBox coordinate space.
//
// The registry only ever emits `<line>`, `<rect>`, `<polygon>`, `<ellipse>`
// and `<text>` (see symbol-registry.generated.ts) — no `<path>`, no gradients,
// no transforms — so a DOMParser walk of the top-level children is sufficient.
// Styling attributes (stroke/fill/vector-effect) are ignored: DXF conveys line
// weight and layer separately, so only geometry is read here.

export interface SvgLine {
  readonly kind: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface SvgRect {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SvgPolygon {
  readonly kind: 'polygon';
  readonly points: readonly { x: number; y: number }[];
}

export interface SvgEllipse {
  readonly kind: 'ellipse';
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export type SvgTextAnchor = 'start' | 'middle' | 'end';
export type SvgTextBaseline = 'alphabetic' | 'central' | 'hanging';

export interface SvgText {
  readonly kind: 'text';
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly fontSize: number;
  readonly anchor: SvgTextAnchor;
  readonly baseline: SvgTextBaseline;
}

export type SvgPrimitive = SvgLine | SvgRect | SvgPolygon | SvgEllipse | SvgText;

const DEFAULT_FONT_SIZE = 12;

export function parseSvgBody(svgBody: string): SvgPrimitive[] {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${svgBody}</svg>`,
    'image/svg+xml',
  );
  // A parse error yields a <parsererror> document — bail rather than throw.
  if (doc.querySelector('parsererror')) return [];

  const primitives: SvgPrimitive[] = [];
  for (const el of Array.from(doc.documentElement.children)) {
    const primitive = parseElement(el);
    if (primitive) primitives.push(primitive);
  }
  return primitives;
}

function parseElement(el: Element): SvgPrimitive | null {
  switch (el.tagName.toLowerCase()) {
    case 'line':
      return {
        kind: 'line',
        x1: num(el, 'x1'),
        y1: num(el, 'y1'),
        x2: num(el, 'x2'),
        y2: num(el, 'y2'),
      };
    case 'rect':
      return {
        kind: 'rect',
        x: num(el, 'x'),
        y: num(el, 'y'),
        width: num(el, 'width'),
        height: num(el, 'height'),
      };
    case 'polygon':
      return { kind: 'polygon', points: parsePoints(el.getAttribute('points')) };
    case 'ellipse':
      return {
        kind: 'ellipse',
        cx: num(el, 'cx'),
        cy: num(el, 'cy'),
        rx: num(el, 'rx'),
        ry: num(el, 'ry'),
      };
    case 'circle':
      return {
        kind: 'ellipse',
        cx: num(el, 'cx'),
        cy: num(el, 'cy'),
        rx: num(el, 'r'),
        ry: num(el, 'r'),
      };
    case 'text':
      return {
        kind: 'text',
        x: num(el, 'x'),
        y: num(el, 'y'),
        text: (el.textContent ?? '').trim(),
        fontSize: num(el, 'font-size', DEFAULT_FONT_SIZE),
        anchor: parseAnchor(el.getAttribute('text-anchor')),
        baseline: parseBaseline(el.getAttribute('dominant-baseline')),
      };
    default:
      return null;
  }
}

function num(el: Element, attr: string, fallback = 0): number {
  const value = Number.parseFloat(el.getAttribute(attr) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function parsePoints(raw: string | null): { x: number; y: number }[] {
  if (!raw) return [];
  const coords = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number.parseFloat)
    .filter(Number.isFinite);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) {
    points.push({ x: coords[i], y: coords[i + 1] });
  }
  return points;
}

function parseAnchor(raw: string | null): SvgTextAnchor {
  return raw === 'middle' || raw === 'end' ? raw : 'start';
}

function parseBaseline(raw: string | null): SvgTextBaseline {
  return raw === 'central' || raw === 'hanging' ? raw : 'alphabetic';
}
