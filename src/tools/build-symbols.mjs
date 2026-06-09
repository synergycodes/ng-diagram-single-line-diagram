#!/usr/bin/env node
// Build-time converter: QElectroTech .elmt -> SVG + TypeScript registry.
// Source files: src/tools/qet-source/*.elmt  (CC-BY 3.0 by The QElectroTech team)
// Outputs:
//   - src/assets/symbols/<id>.svg                       (standalone SVG, debug/preview)
//   - src/app/sld/symbols/symbol-registry.generated.ts  (typed registry consumed by Angular)
//
// Body / lead model:
//   The "body" of a symbol is the central iconographic artwork. The "leads" are the
//   short stub lines from each terminal to the body edge. At runtime, leads are drawn
//   DYNAMICALLY from terminal positions to the body edge — so resize only changes lead
//   length, never the body's size. To make this work, this script splits the .elmt
//   primitives into body-vs-lead at build time: any straight line with one endpoint
//   coinciding with a terminal position is classified as a lead and dropped from the
//   generated svgBody. Everything else goes into the body.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYMBOLS } from './symbols.config.mjs';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(TOOLS_DIR, '..', '..');
const SRC_DIR = join(TOOLS_DIR, 'qet-source');
const OUT_SVG_DIR = join(ROOT_DIR, 'src', 'assets', 'symbols');

const OUT_TS = join(ROOT_DIR, 'src', 'app', 'sld', 'symbols', 'symbol-registry.generated.ts');
const CONSTANTS_TS = join(ROOT_DIR, 'src', 'app', 'sld', 'diagram', 'geometry', 'constants.ts');

// ──────────────────────────────────────────────────────────────────────────
// Hyperparameters
//
// These knobs govern the entire generated library's look. Tweak here, rebuild,
// and every symbol's size + line weight rescales uniformly. Per-symbol overrides
// in symbols.config.mjs (`displaySize` / `body`) bypass auto-derivation for that
// one symbol — useful for one-off tweaks but the goal is to leave the config
// minimal and let the parser standardise everything.
//
// GRID and STROKE_WIDTH come from src/app/sld/diagram/geometry/constants.ts —
// single source of truth, shared with runtime. The rest live here because they
// affect only build-time geometry.
// ──────────────────────────────────────────────────────────────────────────

/** Parse `export const NAME = number;` lines out of constants.ts. The runtime
 *  Angular code is authoritative; this script mirrors those values so build-time
 *  geometry stays aligned with the canvas. */
function readSharedConstants() {
  const text = readFileSync(CONSTANTS_TS, 'utf8');
  const read = (name) => {
    const m = text.match(new RegExp(`export const ${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*;`));
    if (!m) throw new Error(`build-symbols: failed to read ${name} from ${CONSTANTS_TS}`);
    return Number(m[1]);
  };
  return { GRID: read('GRID'), STROKE_WIDTH: read('STROKE_WIDTH') };
}

const { GRID, STROKE_WIDTH } = readSharedConstants();

/** Length (px) of the dynamic stub from a terminal to the body edge. Applied
 *  on every side that has a terminal whose natural .elmt position lies
 *  *outside* the body (i.e. the source had a connecting line stub there). */
const LEAD_LENGTH = 8;

/** Body dimensions are always rounded to multiples of this. A multiple of 16
 *  guarantees that a terminal at 50% of body lands on the GRID=8 raster (16/2=8). */
const BODY_BASE_UNIT = 16;

/** Smallest body extent on the axis *perpendicular* to the terminal axis. Stops
 *  small symbols (transistors, fuses) from collapsing to a thin sliver. */
const BODY_MIN_CROSS_DIM = 32;

/** Scale factor from QET natural-unit → screen pixels for the cross axis. The
 *  main (terminal) axis preserves natural body aspect, so this single number
 *  controls the overall library "size feel". Raise for bigger symbols. */
const BODY_SCALE = 0.7;

/** Cap on body aspect ratio (main / cross). Transistor symbols have very thin
 *  natural bodies (a vertical line + small arrow) that would otherwise blow up
 *  the main dim 5×+ when preserving aspect. Cap pulls the extremes back to a
 *  sane "tall pole" silhouette. */
const BODY_ASPECT_MAX = 2.5;

mkdirSync(OUT_SVG_DIR, { recursive: true });
mkdirSync(dirname(OUT_TS), { recursive: true });

// ---------- .elmt parser ----------

function parseAttrs(str) {
  const out = {};
  for (const m of str.matchAll(/(\w+)="([^"]*)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function parseElmt(xml) {
  const defMatch = xml.match(/<definition\s+([^>]*?)>/);
  if (!defMatch) throw new Error('No <definition> tag found');
  const def = parseAttrs(defMatch[1]);

  const descMatch = xml.match(/<description>([\s\S]*?)<\/description>/);
  if (!descMatch) throw new Error('No <description> block found');

  const primitives = [];
  const terminals = [];

  for (const m of descMatch[1].matchAll(/<(\w+)\s+([^>]*?)\/>/g)) {
    const tag = m[1];
    const attrs = parseAttrs(m[2]);
    if (tag === 'terminal') {
      terminals.push(attrs);
    } else if (['line', 'rect', 'ellipse', 'circle', 'polygon', 'polyline', 'arc'].includes(tag)) {
      primitives.push({ tag, attrs });
    }
  }

  return { def, primitives, terminals };
}

// ---------- Style parser ----------

function styleToSvgAttrs(styleStr = '') {
  const props = {};
  for (const pair of styleStr.split(';')) {
    const [k, v] = pair.split(':').map((s) => (s ?? '').trim());
    if (k) props[k] = v;
  }
  const dashMap = { dashed: '4 2', dotted: '1 2', dashdotted: '4 2 1 2' };

  // Every body primitive gets the same on-screen stroke weight via
  // `vector-effect="non-scaling-stroke"`. QET's per-line `line-weight` is ignored
  // by design — the parser standardises stroke weight across the entire library.
  const attrs = {
    stroke: 'currentColor',
    'stroke-width': STROKE_WIDTH,
    'vector-effect': 'non-scaling-stroke',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };

  const filling = props.filling ?? 'none';
  if (filling === 'none') attrs.fill = 'none';
  else if (filling === 'black') attrs.fill = 'currentColor';
  else if (filling === 'white') attrs.fill = '#ffffff';
  else attrs.fill = filling;

  if (dashMap[props['line-style']]) {
    attrs['stroke-dasharray'] = dashMap[props['line-style']];
  }
  return attrs;
}

function fmt(n) {
  const r = +(+n).toFixed(4);
  return Number.isInteger(r) ? String(r) : String(r);
}

function attrsToString(attrs) {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

// ---------- Primitive -> SVG ----------

function primitiveToSvg(p, hx, hy) {
  const a = p.attrs;
  const styleAttrs = attrsToString(styleToSvgAttrs(a.style));

  switch (p.tag) {
    case 'line':
      return `<line x1="${fmt(+a.x1 + hx)}" y1="${fmt(+a.y1 + hy)}" x2="${fmt(+a.x2 + hx)}" y2="${fmt(+a.y2 + hy)}" ${styleAttrs}/>`;

    case 'rect': {
      const x = fmt(+a.x + hx);
      const y = fmt(+a.y + hy);
      const rx = +a.rx > 0 ? ` rx="${fmt(+a.rx)}"` : '';
      const ry = +a.ry > 0 ? ` ry="${fmt(+a.ry)}"` : '';
      return `<rect x="${x}" y="${y}" width="${fmt(+a.width)}" height="${fmt(+a.height)}"${rx}${ry} ${styleAttrs}/>`;
    }

    case 'ellipse': {
      const w = +a.width;
      const h = +a.height;
      const cx = +a.x + w / 2 + hx;
      const cy = +a.y + h / 2 + hy;
      return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(w / 2)}" ry="${fmt(h / 2)}" ${styleAttrs}/>`;
    }

    case 'circle': {
      const cx = +(a.cx ?? a.x) + hx;
      const cy = +(a.cy ?? a.y) + hy;
      const r = +(a.r ?? a.radius);
      return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" ${styleAttrs}/>`;
    }

    case 'polygon':
    case 'polyline': {
      const pts = [];
      for (let i = 1; ; i++) {
        const x = a[`x${i}`];
        const y = a[`y${i}`];
        if (x === undefined || y === undefined) break;
        pts.push(`${fmt(+x + hx)},${fmt(+y + hy)}`);
      }
      return `<${p.tag} points="${pts.join(' ')}" ${styleAttrs}/>`;
    }

    case 'arc': {
      const cx = +a.x + +a.width / 2 + hx;
      const cy = +a.y + +a.height / 2 + hy;
      const rx = +a.width / 2;
      const ry = +a.height / 2;
      const start = +a.start;
      const sweep = +a.angle;
      const toRad = (d) => (d * Math.PI) / 180;
      const x0 = cx + rx * Math.cos(toRad(start));
      const y0 = cy - ry * Math.sin(toRad(start));
      const x1 = cx + rx * Math.cos(toRad(start + sweep));
      const y1 = cy - ry * Math.sin(toRad(start + sweep));
      const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
      const sweepFlag = sweep > 0 ? 0 : 1;
      return `<path d="M ${fmt(x0)} ${fmt(y0)} A ${fmt(rx)} ${fmt(ry)} 0 ${largeArc} ${sweepFlag} ${fmt(x1)} ${fmt(y1)}" ${styleAttrs}/>`;
    }
  }
  return '';
}

// ---------- Terminals + body ----------

const ORIENTATION_TO_SIDE = { n: 'top', s: 'bottom', e: 'right', w: 'left' };

/** Annotate a terminal with its `kind` from the per-symbol `terminalKinds`
 *  override map, defaulting to `power`. Omit the field when default. */
function withKind(terminal, terminalKinds) {
  const kind = terminalKinds?.[terminal.id];
  if (!kind || kind === 'power') return terminal;
  if (kind !== 'control') {
    throw new Error(
      `Terminal "${terminal.id}": unknown kind "${kind}" (expected 'power' or 'control').`,
    );
  }
  return { ...terminal, kind };
}

/** Convert QET terminals (and overrides) into absolute-coordinate descriptors. */
function computeLocalTerminals({ terminals, def }, overrides) {
  const hx = +def.hotspot_x;
  const hy = +def.hotspot_y;
  const raw = overrides && overrides.length > 0 ? overrides : terminals;
  const usedIds = new Map();

  return raw.map((t) => {
    const orientation = t.orientation;
    const side = ORIENTATION_TO_SIDE[orientation];
    if (!side) throw new Error(`Unknown terminal orientation: ${orientation}`);
    let id = `terminal-${side}`;
    if (usedIds.has(id)) {
      const next = usedIds.get(id) + 1;
      usedIds.set(id, next);
      id = `${id}-${next}`;
    } else {
      usedIds.set(id, 1);
    }
    return {
      id,
      side,
      localX: +t.x + hx,
      localY: +t.y + hy,
    };
  });
}

/**
 * Decide which line primitives are "lead stubs" connecting the body to a terminal,
 * vs. body-internal artwork. Rule: a `<line>` is a lead iff one of its endpoints
 * coincides with a terminal position. Non-line primitives are always body.
 */
function classifyLeadsVsBody(primitives, terminalsAbs, hx, hy) {
  const EPS = 0.01;
  const termPoints = terminalsAbs.map((t) => ({ x: t.localX, y: t.localY }));

  const isAtTerminal = (x, y) =>
    termPoints.some((t) => Math.abs(t.x - x) < EPS && Math.abs(t.y - y) < EPS);

  const body = [];
  for (const p of primitives) {
    if (p.tag === 'line') {
      const x1 = +p.attrs.x1 + hx;
      const y1 = +p.attrs.y1 + hy;
      const x2 = +p.attrs.x2 + hx;
      const y2 = +p.attrs.y2 + hy;
      if (isAtTerminal(x1, y1) || isAtTerminal(x2, y2)) continue; // lead — dropped
    }
    body.push(p);
  }
  return body;
}

/** Bounding box of body primitives in absolute QET coords. */
function computeBodyBbox(primitives, hx, hy) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const update = (x1, y1, x2, y2) => {
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  };
  for (const p of primitives) {
    const a = p.attrs;
    switch (p.tag) {
      case 'line':
        update(+a.x1 + hx, +a.y1 + hy, +a.x2 + hx, +a.y2 + hy);
        break;
      case 'rect':
      case 'ellipse':
      case 'arc': {
        const x0 = +a.x + hx,
          y0 = +a.y + hy;
        update(x0, y0, x0 + +a.width, y0 + +a.height);
        break;
      }
      case 'circle': {
        const cx = +(a.cx ?? a.x) + hx;
        const cy = +(a.cy ?? a.y) + hy;
        const r = +(a.r ?? a.radius);
        update(cx - r, cy - r, cx + r, cy + r);
        break;
      }
      case 'polygon':
      case 'polyline': {
        for (let i = 1; ; i++) {
          const x = a[`x${i}`];
          const y = a[`y${i}`];
          if (x === undefined || y === undefined) break;
          update(+x + hx, +y + hy, +x + hx, +y + hy);
        }
        break;
      }
    }
  }
  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Compute the body's natural viewBox: bounding box of body primitives, expanded so
 * the body is symmetric around the terminal mean on each axis. Symmetry keeps the
 * body's centre visually aligned with the bbox centre when the symbol is rendered.
 */
function computeBodyViewBox(bodyPrims, terminalsAbs, hx, hy) {
  const body = computeBodyBbox(bodyPrims, hx, hy);

  const tbSides = ['top', 'bottom'];
  const lrSides = ['left', 'right'];
  const tbTerms = terminalsAbs.filter((t) => tbSides.includes(t.side));
  const lrTerms = terminalsAbs.filter((t) => lrSides.includes(t.side));

  let left = body.minX;
  let right = body.maxX;
  let top = body.minY;
  let bottom = body.maxY;

  // Top/bottom terminals → force horizontal symmetry around their x-mean.
  if (tbTerms.length > 0) {
    const xMean = tbTerms.reduce((s, t) => s + t.localX, 0) / tbTerms.length;
    const half = Math.max(xMean - body.minX, body.maxX - xMean);
    left = xMean - half;
    right = xMean + half;
  }
  // Left/right terminals → force vertical symmetry around their y-mean.
  if (lrTerms.length > 0) {
    const yMean = lrTerms.reduce((s, t) => s + t.localY, 0) / lrTerms.length;
    const half = Math.max(yMean - body.minY, body.maxY - yMean);
    top = yMean - half;
    bottom = yMean + half;
  }

  return {
    x: +left.toFixed(3),
    y: +top.toFixed(3),
    width: +(right - left).toFixed(3),
    height: +(bottom - top).toFixed(3),
  };
}

/**
 * Compute terminal positions as percentage of the FULL bbox (displaySize), placing
 * them on bbox edges:
 *   - 'top' terminal → yPct = 0
 *   - 'bottom' terminal → yPct = 100
 *   - 'left' terminal → xPct = 0
 *   - 'right' terminal → xPct = 100
 * The terminal's other-axis position comes from the body's centreline so the dynamic
 * lead renders as a perpendicular line straight into the body.
 */
function terminalsToPct(terminalsAbs, bodyViewBox) {
  const bodyCentreX = bodyViewBox.x + bodyViewBox.width / 2;
  const bodyCentreY = bodyViewBox.y + bodyViewBox.height / 2;

  return terminalsAbs.map((t) => {
    let xPct;
    let yPct;

    if (t.side === 'top' || t.side === 'bottom') {
      // Terminal is on top or bottom of the bbox. Its X is given by the .elmt;
      // express as % of body width, anchored at body centre.
      xPct = +(((t.localX - bodyViewBox.x) / bodyViewBox.width) * 100).toFixed(3);
      yPct = t.side === 'top' ? 0 : 100;
    } else {
      yPct = +(((t.localY - bodyViewBox.y) / bodyViewBox.height) * 100).toFixed(3);
      xPct = t.side === 'left' ? 0 : 100;
    }

    // Sanity: the terminal's perpendicular position SHOULD be inside the body's
    // range (otherwise the lead would bend instead of going perpendicular). We
    // don't error on this — leaving it to runtime to bend gracefully — but log.
    return { id: t.id, side: t.side, xPct, yPct };
  });
}

// ---------- Auto-derive body + displaySize ----------

/** Round `value` to the nearest multiple of `unit`. */
function snapToUnit(value, unit) {
  return Math.round(value / unit) * unit;
}

/**
 * Decide whether a side needs a visible lead stub: only if the source .elmt has
 * at least one terminal on that side whose natural coord lies *outside* the
 * body bbox (i.e. the terminal sticks out past the body). For symbols where
 * the terminal sits exactly on the body edge (motor, generator — circle edge
 * is the terminal), no stub is rendered and the bbox edge coincides with the
 * body edge.
 */
function leadNeededOnSide(side, naturalBody, terminalsAbs) {
  const EPS = 0.5;
  const ts = terminalsAbs.filter((t) => t.side === side);
  if (ts.length === 0) return false;
  switch (side) {
    case 'top':
      return ts.some((t) => t.localY < naturalBody.y - EPS);
    case 'bottom':
      return ts.some((t) => t.localY > naturalBody.y + naturalBody.height + EPS);
    case 'left':
      return ts.some((t) => t.localX < naturalBody.x - EPS);
    case 'right':
      return ts.some((t) => t.localX > naturalBody.x + naturalBody.width + EPS);
    default:
      return false;
  }
}

/**
 * Derive `body` + `displaySize` (both in screen px, both grid-aligned) from the
 * symbol's natural body bbox and terminal layout. Driven entirely by the
 * hyperparameters at the top of this file — change one number, every symbol
 * rescales together.
 *
 * Sizing rules:
 *   - The "cross" axis (perpendicular to terminals) gets `crossPx`, derived
 *     from natural cross extent × BODY_SCALE, snapped to BODY_BASE_UNIT, with
 *     a floor of BODY_MIN_CROSS_DIM.
 *   - The "main" axis (between terminals) preserves the natural aspect ratio:
 *     `mainPx = naturalMain × (crossPx / naturalCross)`, snapped, with a floor
 *     of BODY_BASE_UNIT.
 *   - displaySize = body + LEAD_LENGTH per terminal-bearing side (where the
 *     terminal sits outside the body — see `leadNeededOnSide`).
 *
 * Mixed-axis symbols (terminals on both vertical AND horizontal sides, e.g.
 * thyristor with top + bottom + gate) suppress the cross-axis lead. This keeps
 * the cross terminal flush with the bbox edge and avoids an off-centre top
 * terminal — see the body-vs-bbox alignment note in symbol-node.component.ts.
 */
function deriveBodyAndDisplaySize(naturalBody, terminalsAbs) {
  const sides = new Set(terminalsAbs.map((t) => t.side));
  const hasVertical = sides.has('top') || sides.has('bottom');
  const hasHorizontal = sides.has('left') || sides.has('right');

  // Default to vertical orientation for single-terminal / no-terminal symbols.
  const mainIsVertical = hasVertical || !hasHorizontal;

  const naturalCross = mainIsVertical ? naturalBody.width : naturalBody.height;
  const naturalMain = mainIsVertical ? naturalBody.height : naturalBody.width;

  const crossPx = Math.max(
    BODY_MIN_CROSS_DIM,
    snapToUnit(naturalCross * BODY_SCALE, BODY_BASE_UNIT),
  );
  // Preserve natural body aspect on the main axis, but cap it. Some QET symbols
  // (transistors) have a vertical body line that's only ~6 units wide and ~40
  // units tall — without the cap they'd blow up to a 200-px tall pole.
  const naturalAspect = naturalCross > 0 ? naturalMain / naturalCross : 1;
  const cappedAspect = Math.min(naturalAspect, BODY_ASPECT_MAX);
  const mainPx = Math.max(BODY_BASE_UNIT, snapToUnit(crossPx * cappedAspect, BODY_BASE_UNIT));

  const body = mainIsVertical
    ? { width: crossPx, height: mainPx }
    : { width: mainPx, height: crossPx };

  let leadTop = leadNeededOnSide('top', naturalBody, terminalsAbs);
  let leadBottom = leadNeededOnSide('bottom', naturalBody, terminalsAbs);
  let leadLeft = leadNeededOnSide('left', naturalBody, terminalsAbs);
  let leadRight = leadNeededOnSide('right', naturalBody, terminalsAbs);

  // Mixed-axis: cross terminal stays flush with bbox edge (see fn docstring).
  if (hasVertical && hasHorizontal) {
    if (mainIsVertical) {
      leadLeft = false;
      leadRight = false;
    } else {
      leadTop = false;
      leadBottom = false;
    }
  }

  return {
    body,
    displaySize: {
      width: body.width + (leadLeft ? LEAD_LENGTH : 0) + (leadRight ? LEAD_LENGTH : 0),
      height: body.height + (leadTop ? LEAD_LENGTH : 0) + (leadBottom ? LEAD_LENGTH : 0),
    },
  };
}

/**
 * Validate that, given the configured `body` size and the natural body viewBox,
 * the terminals end up on grid intersections when the symbol is rendered at its
 * default displaySize.
 */
function validateTerminalAlignment(symbolId, terminals, displaySize, grid) {
  for (const t of terminals) {
    const px = (t.xPct / 100) * displaySize.width;
    const py = (t.yPct / 100) * displaySize.height;
    if (Math.abs(px % grid) > 1e-6 && Math.abs((px % grid) - grid) > 1e-6) {
      throw new Error(
        `Symbol "${symbolId}" terminal "${t.id}": pixel x=${px} is not a multiple of GRID=${grid}.`,
      );
    }
    if (Math.abs(py % grid) > 1e-6 && Math.abs((py % grid) - grid) > 1e-6) {
      throw new Error(
        `Symbol "${symbolId}" terminal "${t.id}": pixel y=${py} is not a multiple of GRID=${grid}.`,
      );
    }
  }
}

// ---------- Generate ----------

function escapeJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function generateTs(entries) {
  const header = `// AUTOGENERATED by src/tools/build-symbols.mjs — DO NOT EDIT.
// Source: QElectroTech elements library (CC-BY 3.0 by The QElectroTech team).
// See NOTICE.md for attribution. Run \`npm run build:symbols\` to regenerate.

import type { SymbolDef } from './types';

`;

  const body = entries
    .map((e) => {
      const lines = [
        '  {',
        `    id: ${JSON.stringify(e.id)},`,
        `    label: ${JSON.stringify(e.label)},`,
        `    category: ${JSON.stringify(e.category)},`,
        `    voltageTier: ${JSON.stringify(e.voltageTier)},`,
        `    displaySize: ${JSON.stringify(e.displaySize)},`,
        `    body: ${JSON.stringify(e.body)},`,
        `    bodyViewBox: ${JSON.stringify(e.bodyViewBox)},`,
        `    terminals: ${JSON.stringify(e.terminals)},`,
        `    defaultData: ${JSON.stringify(e.defaultData)},`,
        `    propertySchema: ${JSON.stringify(e.propertySchema)},`,
        `    svgBody: \`${escapeJs(e.svgBody)}\`,`,
        '  },',
      ];
      return lines.join('\n');
    })
    .join('\n');

  return `${header}export const SYMBOL_REGISTRY: readonly SymbolDef[] = [\n${body}\n];\n`;
}

// ---------- Main ----------

const entries = [];
for (const cfg of SYMBOLS) {
  const xml = readFileSync(join(SRC_DIR, cfg.sourceFile), 'utf8');
  const parsed = parseElmt(xml);
  const hx = +parsed.def.hotspot_x;
  const hy = +parsed.def.hotspot_y;

  const terminalsAbs = computeLocalTerminals(parsed, cfg.portOverrides);

  // Split primitives into body vs. lead-stubs (leads are dropped from output svgBody).
  const bodyPrims = classifyLeadsVsBody(parsed.primitives, terminalsAbs, hx, hy);
  const bodyViewBox = computeBodyViewBox(bodyPrims, terminalsAbs, hx, hy);
  const terminals = terminalsToPct(terminalsAbs, bodyViewBox).map((t) =>
    withKind(t, cfg.terminalKinds),
  );

  // Auto-derived dims, can be overridden per-symbol in symbols.config.mjs.
  const derived = deriveBodyAndDisplaySize(bodyViewBox, terminalsAbs);
  const body = cfg.body ?? derived.body;
  const displaySize = cfg.displaySize ?? derived.displaySize;

  if (body.width % GRID !== 0 || body.height % GRID !== 0) {
    throw new Error(
      `Symbol "${cfg.id}" body ${body.width}×${body.height} is not a multiple of GRID=${GRID}.`,
    );
  }
  if (displaySize.width % GRID !== 0 || displaySize.height % GRID !== 0) {
    throw new Error(
      `Symbol "${cfg.id}" displaySize ${displaySize.width}×${displaySize.height} is not a multiple of GRID=${GRID}.`,
    );
  }
  if (body.width > displaySize.width || body.height > displaySize.height) {
    throw new Error(
      `Symbol "${cfg.id}" body ${body.width}×${body.height} exceeds displaySize ${displaySize.width}×${displaySize.height}.`,
    );
  }

  validateTerminalAlignment(cfg.id, terminals, displaySize, GRID);

  const svgParts = bodyPrims.map((p) => '  ' + primitiveToSvg(p, hx, hy));
  if (cfg.glyphLabel) {
    const cx = bodyViewBox.x + bodyViewBox.width / 2;
    const cy = bodyViewBox.y + bodyViewBox.height / 2;
    svgParts.push(
      `  <text x="${fmt(cx)}" y="${fmt(cy)}" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" font-family="var(--font-mono, monospace)" font-size="14" font-weight="600">${cfg.glyphLabel}</text>`,
    );
  }

  const svgBody = '\n' + svgParts.join('\n') + '\n';
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bodyViewBox.x} ${bodyViewBox.y} ${bodyViewBox.width} ${bodyViewBox.height}" fill="none" stroke="currentColor">${svgBody}</svg>\n`;

  writeFileSync(join(OUT_SVG_DIR, `${cfg.id}.svg`), fullSvg);

  entries.push({
    id: cfg.id,
    label: cfg.label,
    category: cfg.category,
    voltageTier: cfg.voltageTier,
    displaySize,
    body,
    bodyViewBox,
    terminals,
    defaultData: cfg.defaultData ?? {},
    propertySchema: cfg.propertySchema ?? [],
    svgBody,
  });

  // eslint-disable-next-line no-console
  console.log(
    `  ✓ ${cfg.id.padEnd(14)} ${terminals.length} term  body=${body.width}×${body.height}  bbox=${displaySize.width}×${displaySize.height}`,
  );
}

writeFileSync(OUT_TS, generateTs(entries));
console.log(`\n  Wrote ${entries.length} symbol(s) -> ${OUT_TS}`);
console.log(`  Wrote ${entries.length} SVG(s)    -> ${OUT_SVG_DIR}`);
