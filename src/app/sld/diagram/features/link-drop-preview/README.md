# link-drop-preview

A ghost shown while drawing or relinking an edge: it previews where a junction
would appear if the in-flight edge were dropped onto an existing edge
(edge-split). Purely presentational, reactive to the live gesture state.

**Register:** mount `LinkDropPreviewOverlayComponent` (no providers).

**Depends on:** `core/` only. It hit-tests edges with `core/geometry/edge-split`
(generic orthogonal-edge geometry) and renders a dot — it never touches the `junctions`
feature, despite previewing one.
