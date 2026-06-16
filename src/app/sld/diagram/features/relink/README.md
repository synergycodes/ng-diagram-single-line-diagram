# relink

Drag either endpoint of a selected edge to a new target. On drop it resolves
through its own priority (port → junction → edge-split; dangling falls out of
the live preview).

The junction-graph edits are delegated to `junctions`' `JunctionAttachmentService`,
driven through a `RelinkBranch` — relink's implementation of junctions'
`DroppedBranch` contract (how a relink commits: update the existing edge in
place). Relink therefore depends only on `junctions`, never on `linking`, even
though both reuse the same attachment service.

**Register:** mount `RelinkOverlayComponent` in the diagram (no providers;
`JunctionAttachmentService` comes from `provideJunctions()`).

**Depends on:** `core/` (incl. `geometry/edge-split` for the hit test) and
`junctions` (`JunctionAttachmentService` + `DroppedBranch` + `reconcileJunction`,
via its `index.ts`).
