/**
 * Relink feature — drag either endpoint of a selected edge to a new target.
 *
 * On drop it resolves port → junction → edge-split (dangling falls out of the
 * live preview), delegating the junction-graph edits to junctions'
 * `JunctionAttachmentService` through a `RelinkBranch` (its `DroppedBranch`
 * implementation). Drop `RelinkOverlayComponent` into the diagram and spread
 * `provideRelink()` into its providers (`JunctionAttachmentService` comes from
 * `provideJunctions()`).
 */
import type { Provider } from '@angular/core';
import { RelinkGestureService } from './relink-gesture.service';

export { RelinkOverlayComponent } from './overlays/relink-overlay/relink-overlay.component';
export { RelinkGestureService } from './relink-gesture.service';

// In-flight relink-gesture state, shared with the canvas and link-drop preview.
export function provideRelink(): Provider[] {
  return [RelinkGestureService];
}
