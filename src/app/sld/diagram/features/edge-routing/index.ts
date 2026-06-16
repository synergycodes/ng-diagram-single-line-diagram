/**
 * Edge-routing feature — keep manual edges attached as their nodes move.
 *
 * After a selection move, re-anchors each incident manual edge to the live port
 * positions, sliding interior bends or inserting an L-bend so the polyline stays
 * orthogonal. Pure side-effect helper: the canvas calls
 * `applyEdgeStretchOnSelectionMoved` from its `selectionMoved` handler (no
 * providers, no components).
 */
export { applyEdgeStretchOnSelectionMoved } from './edge-stretch-on-move';
