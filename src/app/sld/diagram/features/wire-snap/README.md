# wire-snap

Nudges a dragged or dropped symbol so a terminal lands exactly on a nearby wire,
on the grid. No edge is created — the connection is derived geometrically; the
controller just moves the node (with a guard against the re-entrant
`selectionMoved` cascade its own update triggers).

**Register:** `...provideWireSnap()` in the diagram providers; call
`WireSnapController.trySnap(node)` from the `paletteItemDropped` and
`selectionMoved` handlers.

**Depends on:** `core/` only.
