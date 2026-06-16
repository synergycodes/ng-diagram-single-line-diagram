# edge-routing

Keeps manual-routed edges attached as their nodes move. After a selection move,
re-anchors each incident manual edge to the live port positions, sliding
interior bends or inserting an L-bend so the polyline stays orthogonal.

**Register:** call `applyEdgeStretchOnSelectionMoved(modelService, movedIds)`
from the diagram's `selectionMoved` handler (no providers, no components).

**Depends on:** `core/` only (the pure polyline ops live in `core/geometry`).
