import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, NgDiagramSelectionService, type Node } from 'ng-diagram';
import { SLD_SYMBOL_NODE_TYPE } from '../geometry/node-types';
import { rotateSymbolPatch } from '../geometry/rotation';
import { DiagramModeService } from '../mode/diagram-mode.service';
import { SpatialBoundsRefresherService } from '../ng-diagram-bridge/spatial-bounds-refresher.service';

/**
 * Maps keyboard shortcuts to diagram actions, keeping the key-handling logic out
 * of the canvas component (which only registers the `keydown` event and forwards
 * it here):
 *   R — rotate selected symbols 90° clockwise
 *   M — toggle diagram mode (sketch / linking)
 * Both are ignored while the user is typing in a form field.
 */
@Injectable()
export class DiagramKeyboardService {
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly modeService = inject(DiagramModeService);
  private readonly spatialBounds = inject(SpatialBoundsRefresherService);

  // Entry point: the canvas component forwards every keydown here.
  handleKeydown(event: KeyboardEvent): void {
    // Don't steal keys while the user types in a field (palette search, tag edit, …).
    const target = event.target as HTMLElement | null;
    if (target && (target.matches('input, textarea, select') || target.isContentEditable)) {
      return;
    }

    if (event.key === 'm' || event.key === 'M') {
      // Bare M only — leave modified combos (Cmd+M, etc.) to the browser/OS.
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      this.modeService.toggle();
      return;
    }

    if (event.key !== 'r' && event.key !== 'R') return;
    const selectedSymbols = this.selectionService
      .selection()
      .nodes.filter((node: Node) => node.type === SLD_SYMBOL_NODE_TYPE);
    if (selectedSymbols.length === 0) return;
    event.preventDefault();
    for (const node of selectedSymbols) {
      const patch = rotateSymbolPatch(node);
      if (patch) this.modelService.updateNode(node.id, patch);
    }
    // Rotation moves ports; refresh the spatial hash so port-snap stays accurate.
    this.spatialBounds.refresh();
  }
}
