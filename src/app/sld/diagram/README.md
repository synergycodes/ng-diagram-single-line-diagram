# Diagram subsystem

The interactive single-line-diagram editor built on **ng-diagram**. It's split
so the reusable, copy-pasteable behaviour (`features/`) is clearly separated
from the shared plumbing it stands on (`core/`).

```
diagram/
  canvas/      thin host component — registers templates, middlewares, config
               and routes ng-diagram events to features. No domain logic.
  core/        shared infrastructure (NOT a feature):
    geometry/          pure math + domain types + orthogonal-edge ops
    ng-diagram-bridge/ adapters over the ng-diagram API (config, actions,
                       pointer-drag)
    nodes/  edges/     node & edge render components
  features/    self-contained, copy-pasteable behaviours (see below)
  export/      read-only SVG snapshot of the diagram
```

## Features

Each folder under `features/` is a self-contained behaviour with a single public
entry point (`index.ts`). It depends only on `core/` and — where one behaviour
genuinely builds on another — on a sibling feature's `index.ts`, never its
internals.

| Feature             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `junctions/`        | The junction graph: derive, drop-attach/edge-split, cleanup/merge, render, dangling ends |
| `linking/`          | Turn a port-to-port draw into a connection (drives junction attachment) |
| `relink/`           | Drag an edge endpoint to a new target (drives junction attachment)  |
| `edge-reshape/`     | Drag any segment of an edge (generic; junction rules plug in)       |
| `edge-routing/`     | Keep manual edges attached as their nodes move                      |
| `link-drop-preview/`| Ghost preview of where a dropped edge would land                    |

## How a feature registers

The canvas is the only wiring point. A feature exposes some of:

- **Overlay component(s)** → added to the canvas `imports[]` and template.
- **`provide<Feature>()`** → spread into the canvas `providers[]`.
- **Event handlers / controllers** → the canvas calls them from its ng-diagram
  event handlers (`selectionMoved`, `edgeDrawEnded`, `selectionRemoved`, …).

```ts
// canvas/diagram.component.ts (illustrative)
import { provideJunctions, JunctionOverlayComponent /* … */ } from '../features/junctions';
import { provideRelink, RelinkOverlayComponent } from '../features/relink';

@Component({
  imports: [JunctionOverlayComponent, RelinkOverlayComponent /* … */],
  providers: [...provideJunctions(), ...provideRelink() /* … */],
})
export class DiagramComponent {
  // the canvas only forwards ng-diagram events to feature controllers
}
```

To drop a feature into another project: copy its folder, add `core/` (or the
bits it imports), and call its `provide*()` / mount its overlays.

## Patterns worth copying

- **Feature entry point** — every feature has an `index.ts` that re-exports its
  public surface and a `provide*()` for its DI. Consumers import the barrel,
  never deep paths.
- **Extension points over coupling** — a feature that could be specialised stays
  generic and exposes a contract; the specialising feature implements it. Two
  examples of the same inversion:
  - `edge-reshape` exposes `EDGE_RESHAPE_EXTENSION`; `junctions` implements it so
    a segment drag can carry a junction along. Reshape never imports junctions.
  - `junctions`' `JunctionAttachmentService` is generic over `DroppedBranch`;
    `linking` (`NewDrawBranch`) and `relink` (`RelinkBranch`) each implement it.
    Junctions never imports them, and linking/relink never import each other.

## Dependency direction

`features → core`, and `feature → sibling feature` only through the sibling's
`index.ts`. `core` never imports a feature. This keeps the dependency graph
acyclic and every feature liftable on its own.
