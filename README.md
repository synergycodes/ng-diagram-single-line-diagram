# SLD Builder

An Angular 19 configurator for **single-line diagrams** (SLDs) of high-voltage
electrical substations, built on [ng-diagram](https://www.ngdiagram.dev). The
symbol library targets the **IEC 60617** graphical standard and is curated for
HV transmission work (>=110 kV): switchgear, transformers, instrument
transformers, and compensation.

It doubles as a reference template for building a domain-specific node editor on
ng-diagram: a custom node/edge model, a generated symbol pipeline, derived
connectivity, and a schema-driven properties panel.

## Quick start

```bash
npm install
npm start          # ng serve, then open http://localhost:4200/
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Dev server with hot reload (`ng serve`). |
| `npm run build` | Production build to `dist/single-line-diagram`. |
| `npm run watch` | Development build in watch mode. |
| `npm test` | Unit tests via Karma + Jasmine. Run once: `npm test -- --watch=false --browsers=ChromeHeadless`. |
| `npm run build:symbols` | Regenerate the symbol registry from the QElectroTech sources. |
| `npm run lint` | Lint with ESLint (angular-eslint). |
| `npm run format` | Format with Prettier; `npm run format:check` verifies without writing. |

## Architecture

The app is a single standalone-component Angular app. The route `''` lazy-loads
`SldPageComponent`, which hosts a header, the symbol library (left), the canvas
(center), and the properties panel (right). `provideNgDiagram()` is provided on
that page, not at the bootstrap root, because ng-diagram services inject the
host `ElementRef`.

### Two editing modes

The canvas has two modes, toggled by the header chip or the `M` key.

- **Sketch mode** is the geometric model. Wires are placeable nodes, symbol
  ports are hidden, and junctions are computed dots painted by an overlay where
  3+ wire-continuations meet. Connectivity is derived from world positions every
  render; nothing is stored.
- **Linking mode** (default) is native ng-diagram editing. Ports are visible,
  the user draws edges port-to-port, junctions are real selectable nodes, and
  edges use ng-diagram's built-in orthogonal routing.

### Node types

- `sld-symbol`: an IEC 60617 device. Fixed-size body plus dynamic leads (stubs
  from each terminal to the body edge) that grow with the bounding box.
- `sld-wire`: a horizontal or vertical busbar segment (placeable node, not an
  edge).
- `sld-junction`: an 8 px node with four directional ports, created and torn
  down automatically as edges meet.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `R` | Rotate the selected symbols 90 degrees clockwise. |
| `M` | Toggle between sketch and linking mode. |
| `Alt` + drag | Move a node together with its whole geometric connected component. |

## Use as a template

Common extension points:

- **Add a symbol.** Drop a `.elmt` file into `src/tools/qet-source/`, add a stub
  to `src/tools/symbols.config.mjs`, then run `npm run build:symbols`. Do not
  hand-edit the generated `src/app/sld/symbols/symbol-registry.generated.ts` or
  `src/assets/symbols/*.svg`.
- **Add a node type.** See `src/app/sld/diagram/core/geometry/node-types.ts` for
  the type constants and data contracts, and register the component in the
  template map in `src/app/sld/diagram/canvas/diagram.component.ts`.
- **Add a properties-panel field type.** Register a new Formly type in
  `SldPageComponent.providers`, extend `PropertyType` in
  `src/app/sld/symbols/types.ts`, and extend the mapper in
  `src/app/sld/components/properties-panel/formly/field-from-property-def.ts`.

## Symbol pipeline

`src/tools/build-symbols.mjs` converts a curated subset of QElectroTech `.elmt`
sources into SVG bodies and a TypeScript registry. It splits each device into a
fixed body and dynamic leads at build time, enforces 8 px grid alignment, and
fails loudly if a generated dimension is not a multiple of the grid.

## Testing

Unit tests live next to their source as `*.spec.ts` and run on Karma + Jasmine.
The current suite covers the pure-function geometry, routing, and connectivity
logic. Run a single file with `npm test -- --include='**/path/to/file.spec.ts'`.

## Documentation

Architecture and per-feature guides live next to the code:

- `src/app/sld/diagram/README.md` — the diagram subsystem: `core/` vs
  `features/`, how a feature registers with the canvas, and the extension-point
  patterns (`ReshapeExtension`, `DroppedBranch`).
- `src/app/sld/diagram/features/*/README.md` — one per feature.
- `src/app/sld/shared/icons/README.md` — the icon system.

## License

This project's own code is released under the [MIT License](LICENSE).

The electrical symbol artwork is derived from the QElectroTech elements library
and is licensed under CC-BY 3.0. See [NOTICE.md](NOTICE.md) for attribution
details and the list of derived versus project-original sources.
