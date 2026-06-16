# junctions

The junction graph — the dots where 3+ wire/edge ends meet.

- **Derives** junction positions from geometry (`junctions.service.ts` +
  `graph/junction-detection.ts`).
- **Resolves** where a dropped link endpoint attaches to the graph — reuse a
  junction, merge a loose end, or split an edge (`junction-attachment.service.ts`
  + `graph/junction-geometry.ts`).
- **Maintains** them: merge/remove redundant ones after edits
  (`graph/junction-cleanup.ts`, `graph/delete-cleanup.ts`).
- **Renders** them and loose ends (`overlays/`).
- **Teaches** edge-reshape to drag a junction along with a segment
  (`junction-reshape-extension.ts`, via `EDGE_RESHAPE_EXTENSION`).

`JunctionAttachmentService` is generic over `DroppedBranch` (`dropped-branch.ts`):
it never knows whether the dropped endpoint is a fresh draw or a relink. Each
consumer feature implements `DroppedBranch` and plugs in — the same inversion as
the reshape extension, one level up.

**Register:** `...provideJunctions()` in the diagram providers; mount
`JunctionOverlayComponent` + `DanglingEndpointsOverlayComponent`; call
`applyDeleteCleanup` from `selectionRemoved`.

**Depends on:** `core/` and `edge-reshape` (its public extension token).
**Used by:** `linking`, `relink`, `link-drop-preview` — each via `index.ts`
(generic graph ops + the `DroppedBranch` contract); none reach into each other.
