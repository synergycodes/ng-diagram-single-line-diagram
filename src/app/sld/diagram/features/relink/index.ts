/**
 * Relink feature — drag either endpoint of a selected edge to a new target.
 *
 * On drop it resolves port → junction → edge-split (dangling falls out of the
 * live preview), delegating the junction-graph edits to junctions'
 * `JunctionAttachmentService` through a `RelinkBranch` (its `DroppedBranch`
 * implementation). Drop `RelinkOverlayComponent` into the diagram
 * (`JunctionAttachmentService` comes from `provideJunctions()`).
 */
export { RelinkOverlayComponent } from './overlays/relink-overlay/relink-overlay.component';
