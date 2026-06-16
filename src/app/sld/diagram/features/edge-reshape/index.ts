/**
 * Edge-reshape feature — drag any orthogonal segment of a selected edge.
 *
 * It knows only polyline geometry and an endpoint vocabulary
 * (anchored / free / dangling). Domain behaviour — what a "free" end is and
 * what to do when it moves — is plugged in by a consumer through the
 * `EDGE_RESHAPE_EXTENSION` token (see reshape-extension.ts). Drop
 * `EdgeReshapeOverlayComponent` into the diagram; it needs no providers of its
 * own (an extension provider is optional).
 */
export { EdgeReshapeOverlayComponent } from './overlays/edge-reshape-overlay/edge-reshape-overlay.component';
export {
  EDGE_RESHAPE_EXTENSION,
  type ReshapeExtension,
  type ReshapeDragContext,
} from './reshape-extension';
// The endpoint vocabulary + the anchored-segment reshape a consumer's extension
// needs (the junctions feature uses both); the rest of edge-reshape.ts is the
// overlay's own and stays unexported.
export { reshapeAnchoredSegment, type ReshapeEndpointKind } from './edge-reshape';
