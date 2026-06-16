import type { Provider } from '@angular/core';
import { LinkDrawService } from './link-draw.service';

/**
 * Linking feature — turns a native port-to-port draw into a real connection.
 *
 * Owns the draw-gesture entry point and the drop resolution ORDER (nearby
 * junction → dangling end → split an edge → leave dangling). The junction-graph
 * edits themselves belong to the junctions feature: linking drives
 * `JunctionAttachmentService` through a `NewDrawBranch` — its implementation of
 * junctions' `DroppedBranch` contract. Register with `provideLinking()`; the
 * canvas calls `LinkDrawService.handleEdgeDrawDrop` on `edgeDrawEnded`.
 */
export { LinkDrawService } from './link-draw.service';

/** Providers for the linking feature. Add to the diagram component's `providers`. */
export function provideLinking(): Provider[] {
  return [LinkDrawService];
}
