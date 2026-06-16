import { Injectable, computed, inject } from '@angular/core';
import { NgDiagramService, type Point } from 'ng-diagram';

// Single read-only adapter over ng-diagram's `actionState()` gesture internals.
// The inner shape is undocumented and renamed across 1.2.x patches — centralising
// access keeps version-bump churn to one file.
@Injectable()
export class NgDiagramActionsAdapter {
  private readonly ngDiagramService = inject(NgDiagramService);

  readonly isLinkingActive = computed(() => !!this.ngDiagramService.actionState().linking);

  readonly linkingSourceNodeId = computed<string | undefined>(
    () => this.ngDiagramService.actionState().linking?.sourceNodeId,
  );

  // Normalise ng-diagram's empty-string "no port" to undefined for callers.
  readonly linkingSourcePortId = computed<string | undefined>(() => {
    const portId = this.ngDiagramService.actionState().linking?.sourcePortId;
    return portId ? portId : undefined;
  });

  readonly linkingCursorWorld = computed<Point | undefined>(
    () => this.ngDiagramService.actionState().linking?.temporaryEdge?.targetPosition,
  );

  readonly isAltDragging = computed(
    () => !!this.ngDiagramService.actionState().dragging?.modifiers.secondary,
  );
}
