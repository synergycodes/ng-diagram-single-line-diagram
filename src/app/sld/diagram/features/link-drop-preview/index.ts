/**
 * Link-drop-preview feature — ghost shown while drawing/relinking an edge.
 *
 * Renders a preview of where a junction would appear if the in-flight edge were
 * dropped on an existing edge (edge-split). Purely presentational and reactive
 * to the live linking/relink gesture state. Drop `LinkDropPreviewOverlayComponent`
 * into the diagram (no providers of its own).
 */
export { LinkDropPreviewOverlayComponent } from './overlays/link-drop-preview-overlay/link-drop-preview-overlay.component';
