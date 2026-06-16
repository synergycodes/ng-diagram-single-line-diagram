# linking

Turns a native port-to-port draw into a real connection. Owns the draw-gesture
entry point and the drop resolution **order** — nearby junction → dangling end →
split an edge → leave dangling.

The junction-graph edits themselves are **not** here: `LinkDrawService` drives
`junctions`' `JunctionAttachmentService`, passing a `NewDrawBranch` — its
implementation of junctions' `DroppedBranch` contract (how a new draw commits:
add a fresh edge). So linking holds no junction logic and knows nothing about
`relink`, which plugs into the same service with its own branch.

**Register:** `...provideLinking()` in the diagram providers; call
`LinkDrawService.handleEdgeDrawDrop(event)` from `edgeDrawEnded`.

**Depends on:** `core/` (incl. `geometry/edge-split` for the hit test) and
`junctions` (`JunctionAttachmentService` + `DroppedBranch`, via its `index.ts`).
