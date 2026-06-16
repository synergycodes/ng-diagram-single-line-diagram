import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, NgDiagramSelectionService, type Node } from 'ng-diagram';
import { isSymbolNode, SLD_SYMBOL_NODE_TYPE, type SymbolOrientation } from '../geometry/node-types';
import { rotateSymbolPatch } from '../geometry/rotation';
import { terminalEffectiveSide } from '../geometry/symbol-geometry';
import { DiagramModeService } from '../mode/diagram-mode.service';
import { SpatialBoundsRefresherService } from '../ng-diagram-bridge/spatial-bounds-refresher.service';
import { SymbolRegistryService } from '../../../symbols/symbol-registry.service';

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
  private readonly registry = inject(SymbolRegistryService);

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
    const rotatedIds = new Set<string>();
    for (const node of selectedSymbols) {
      const patch = rotateSymbolPatch(node);
      if (patch) {
        this.modelService.updateNode(node.id, patch);
        this.syncRotatedPortSides(node, patch.data.orientation);
        rotatedIds.add(node.id);
      }
    }
    this.rerouteIncidentManualEdges(rotatedIds);
    // Rotation moves ports; refresh the spatial hash so port-snap stays accurate.
    this.spatialBounds.refresh();
  }

  // Re-stamp each measured port's `side` for the new orientation: ng-diagram
  // re-measures port position on rotation but not its side, so the router would
  // route off the stale pre-rotation side (a port now on the right treated as
  // `top` → exit stub points up). Position catches up on the next measure.
  private syncRotatedPortSides(node: Node, orientation: SymbolOrientation): void {
    if (!isSymbolNode(node) || !node.measuredPorts) return;
    const symbol = this.registry.getById(node.data.symbolId);
    if (!symbol) return;
    const measuredPorts = node.measuredPorts.map((port) => {
      const terminal = symbol.terminals.find((t) => t.id === port.id);
      return terminal ? { ...port, side: terminalEffectiveSide(terminal.side, orientation) } : port;
    });
    this.modelService.updateNode(node.id, { measuredPorts });
  }

  // Auto edges re-route to the rotated ports for free; manual (reshaped /
  // split-half) edges keep their frozen polyline and detach. Flip incident
  // manual edges to 'auto' so they re-anchor and exit along the new side —
  // trading their manual bends for a correct route (expected when rotating).
  private rerouteIncidentManualEdges(rotatedIds: ReadonlySet<string>): void {
    if (rotatedIds.size === 0) return;
    const patches = this.modelService
      .edges()
      .filter(
        (edge) =>
          edge.routingMode === 'manual' &&
          (rotatedIds.has(edge.source) || rotatedIds.has(edge.target)),
      )
      .map((edge) => ({ id: edge.id, routingMode: 'auto' as const, points: undefined }));
    if (patches.length > 0) this.modelService.updateEdges(patches);
  }
}
