import type { Provider } from '@angular/core';
import { WireSnapController } from './wire-snap.controller';

/**
 * Wire-snap feature — auto-aligns a dragged symbol terminal onto a nearby wire.
 * Register with `provideWireSnap()` and call `WireSnapController.trySnap(node)`
 * from the diagram's palette-dropped / selection-moved handlers.
 */
export { WireSnapController } from './wire-snap.controller';

/** Providers for the wire-snap feature. Add to the diagram component's `providers`. */
export function provideWireSnap(): Provider[] {
  return [WireSnapController];
}
