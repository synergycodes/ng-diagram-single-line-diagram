import { InjectionToken } from '@angular/core';
import type { Edge, Point } from 'ng-diagram';
import type { ReshapeEndpointKind } from './edge-reshape';

/**
 * Extension point that lets another feature teach edge-reshape about domain
 * concepts it must stay ignorant of.
 *
 * The reshape overlay understands only orthogonal-edge geometry. Anything
 * beyond that — what an edge end is attached to, and what should happen to that
 * thing when a free end is dragged — is supplied here. In this app the
 * junctions feature provides one (junctions + former-parent halves); a
 * project without junctions simply provides none and gets plain port-anchored
 * reshaping.
 *
 * `TSnapshot` is an opaque baseline the extension captures at gesture start and
 * receives back on every move; the overlay never inspects it.
 */
export interface ReshapeExtension<TSnapshot = unknown> {
  /**
   * Map an edge endpoint node onto a reshape endpoint kind. Called for both
   * ends of every selected edge to decide which segments anchor vs. move.
   */
  classifyEndpoint(nodeId: string): ReshapeEndpointKind;

  /**
   * Capture a baseline when a drag that moves a free end begins. Return null to
   * opt out of propagation for this gesture.
   */
  snapshot(edge: Edge, ctx: ReshapeDragContext): TSnapshot | null;

  /**
   * React to the reshape after the dragged edge has committed `newPoints`.
   * Invoked inside the reshape transaction so any dependent edits (moving the
   * free node, re-routing siblings) commit atomically with the edge.
   */
  apply(snapshot: TSnapshot, ctx: ReshapeDragContext, newPoints: readonly Point[]): void;
}

/** What the overlay tells the extension about the in-flight reshape. */
export interface ReshapeDragContext {
  readonly edgeId: string;
  readonly axis: 'horizontal' | 'vertical';
  readonly segmentIndex: number;
  /** End sitting on a free node dragged with the segment, or null. */
  readonly propagateToFreeEnd: 'source' | 'target' | null;
  readonly initialPoints: readonly Point[];
}

/**
 * Optional DI token for a {@link ReshapeExtension}. The overlay injects it with
 * `{ optional: true }`; when absent, reshape falls back to anchored/dangling
 * behaviour with no free-end propagation.
 */
export const EDGE_RESHAPE_EXTENSION = new InjectionToken<ReshapeExtension>(
  'EDGE_RESHAPE_EXTENSION',
);
