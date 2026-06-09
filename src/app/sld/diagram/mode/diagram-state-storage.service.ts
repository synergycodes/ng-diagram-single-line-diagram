import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { NgDiagramModelService, NgDiagramSelectionService, type Edge, type Node } from 'ng-diagram';
import { DiagramModeService, type DiagramMode } from './diagram-mode.service';

interface ModelSnapshot {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}

// Per-mode {nodes, edges} snapshot. Modes never share elements because their
// connection paradigms (positional vs. native edges) would clash. Viewport
// is intentionally NOT per-mode.
@Injectable()
export class DiagramStateStorageService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly modeService = inject(DiagramModeService);

  private readonly snapshots = new Map<DiagramMode, ModelSnapshot>();
  private currentMode: DiagramMode = this.modeService.mode();

  // Consumers of `selectionRemoved` read this to skip side effects —
  // the mass-delete during a swap is not a user intent.
  private readonly _isSwapping = signal(false);
  readonly isSwapping = this._isSwapping.asReadonly();

  constructor() {
    effect(() => {
      const next = this.modeService.mode();
      if (next === this.currentMode) return;
      untracked(() => this.swap(this.currentMode, next));
      this.currentMode = next;
    });
  }

  private swap(from: DiagramMode, to: DiagramMode): void {
    this._isSwapping.set(true);
    try {
      // Deep-clone the snapshot so live ng-diagram mutations can't reach it.
      this.snapshots.set(from, {
        nodes: structuredClone([...this.modelService.nodes()]),
        edges: structuredClone([...this.modelService.edges()]),
      });

      // Edges first so deleting endpoint nodes can't leave dangling refs mid-tick.
      const liveEdgeIds = this.modelService.edges().map((edge) => edge.id);
      const liveNodeIds = this.modelService.nodes().map((node) => node.id);
      if (liveEdgeIds.length > 0) this.modelService.deleteEdges(liveEdgeIds);
      if (liveNodeIds.length > 0) this.modelService.deleteNodes(liveNodeIds);

      // Deep-clone on restore too — ng-diagram mutates measurement metadata
      // on the objects we hand it.
      const target = this.snapshots.get(to);
      if (target) {
        if (target.nodes.length > 0) {
          this.modelService.addNodes(structuredClone([...target.nodes]));
        }
        if (target.edges.length > 0) {
          this.modelService.addEdges(structuredClone([...target.edges]));
        }
      }

      // Outgoing-mode selection ids may not exist in the incoming mode.
      this.selectionService.deselectAll();
    } finally {
      this._isSwapping.set(false);
    }
  }
}
