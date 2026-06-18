# edge-reshape

Drag any orthogonal segment of a selected edge. Fully generic — it knows only
orthogonal-edge geometry and an endpoint vocabulary (`anchored` / `free` / `dangling`).

Domain behaviour is plugged in, not hard-coded: a consumer provides a
`ReshapeExtension` via the `EDGE_RESHAPE_EXTENSION` token to classify endpoints
and react when a free end moves. In this app the `junctions` feature provides
one; without it, reshape still works as plain port-anchored editing.

**Register:** mount `EdgeReshapeOverlayComponent` (no providers of its own).
Optionally provide an `EDGE_RESHAPE_EXTENSION`.

**Depends on:** `core/` only. **Used by:** `junctions` (implements the extension).
