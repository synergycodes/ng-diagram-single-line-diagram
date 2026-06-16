import type { Provider } from '@angular/core';
import { EDGE_RESHAPE_EXTENSION } from '../edge-reshape';
import { JunctionsService } from './junctions.service';
import { JunctionAttachmentService } from './junction-attachment.service';
import { JunctionReshapeExtension } from './junction-reshape-extension';

/**
 * Junctions feature — the junction graph for an SLD-style diagram.
 *
 * A "junction" is the dot where 3+ wire/edge ends meet. This feature derives
 * them from geometry, creates them by splitting an edge on drop,
 * merges/removes redundant ones after edits, renders them, surfaces loose
 * (dangling) ends, and teaches edge-reshape how to drag a junction along with a
 * segment. Register it with `provideJunctions()`, drop the overlays into your
 * diagram, and (optionally) call the graph ops from neighbouring features
 * through this entry point.
 */
export { JunctionsService } from './junctions.service';
// Resolves where a dropped link endpoint attaches to the junction graph; the
// consumer supplies a DroppedBranch (linking, relink) describing how to commit.
export { JunctionAttachmentService } from './junction-attachment.service';
export type { DroppedBranch } from './dropped-branch';
export { JunctionOverlayComponent } from './overlays/junction-overlay/junction-overlay.component';
export { DanglingEndpointsOverlayComponent } from './overlays/dangling-endpoints-overlay/dangling-endpoints-overlay.component';
export { applyDeleteCleanup } from './graph/delete-cleanup';

// Graph operation a consumer builds on: relink calls this to tidy the junction
// it dragged an endpoint away from.
export { reconcileJunction } from './graph/junction-cleanup';

/**
 * Providers for the junctions feature. Includes the reshape extension wiring so
 * dragging a segment into a junction moves the junction (and its former-split
 * partner half). Add to the diagram component's `providers`.
 */
export function provideJunctions(): Provider[] {
  return [
    JunctionsService,
    JunctionAttachmentService,
    JunctionReshapeExtension,
    { provide: EDGE_RESHAPE_EXTENSION, useExisting: JunctionReshapeExtension },
  ];
}
