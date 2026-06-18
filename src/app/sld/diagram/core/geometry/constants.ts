// `src/tools/build-symbols.mjs` parses this file as text — keep each
// `export const NAME = value;` declaration on a single line.

// Layout grid pitch in px. Everything snaps to this so symbols, edges and
// junctions line up — also the unit most other geometry constants are derived from.
export const GRID = 8;

export const STROKE_WIDTH = 2;

// Coordinate equality slack in px. Two points within this count as coincident —
// absorbs sub-pixel float drift from rotation/snap math without merging distinct points.
export const POSITION_TOLERANCE_PX = 1;

// Link-snap gravity: how close the cursor gets before a link/relink snaps to a
// port. Single source of truth — also feeds ng-diagram's native
// `LinkingConfig.portSnapDistance` (see `diagram-config.ts`).
export const PORT_SNAP_PX = GRID * 2;

// SVG dasharray for control links and control leads. Mirrors the
// `--dash-control` token in `src/tokens.css` — keep both in sync.
export const CONTROL_DASHARRAY = '4 3';
