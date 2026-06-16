import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, type Node } from 'ng-diagram';
import { SymbolRegistryService } from '../../../symbols/symbol-registry.service';
import { findWireSnap } from '../../core/geometry/wire-snap';
import { NgDiagramActionsAdapter } from '../../core/ng-diagram-bridge/ng-diagram-actions.adapter';

// After our own `updateNode` lands, ng-diagram re-emits `selectionMoved`; this
// window lets that cascade settle before we accept another snap.
const SNAP_GUARD_RELEASE_MS = 50;

/**
 * Wire-snap feature — nudge a dragged/dropped symbol so a terminal lands exactly
 * on a nearby wire, on the grid. No edge is created; the connection is derived
 * geometrically. The canvas just forwards moved/dropped nodes to `trySnap`.
 */
@Injectable()
export class WireSnapController {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);
  private readonly actions = inject(NgDiagramActionsAdapter);

  // Guards against the snap-triggered selectionMoved cascade re-entering.
  private isApplyingSnap = false;

  /** Snap `node` onto a nearby wire if one is in range; otherwise a no-op. */
  trySnap(node: Node): void {
    if (this.isApplyingSnap) return;

    // Alt-drag carries the connected component — snapping the anchor would
    // leave the trailing group behind.
    if (this.actions.isAltDragging()) return;

    const snap = findWireSnap(node, this.modelService.nodes(), (id) => this.registry.getById(id));
    if (!snap || (snap.delta.x === 0 && snap.delta.y === 0)) return;

    this.isApplyingSnap = true;
    try {
      this.modelService.updateNode(node.id, {
        position: {
          x: node.position.x + snap.delta.x,
          y: node.position.y + snap.delta.y,
        },
      });
    } finally {
      // Defer past the cascading `selectionMoved` from our own update.
      setTimeout(() => {
        this.isApplyingSnap = false;
      }, SNAP_GUARD_RELEASE_MS);
    }
  }
}
