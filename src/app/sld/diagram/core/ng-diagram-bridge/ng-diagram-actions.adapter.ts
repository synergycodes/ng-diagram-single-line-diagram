import { Injectable, computed, inject } from '@angular/core';
import { NgDiagramService, type Point } from 'ng-diagram';

// Single read-only adapter over ng-diagram's `actionState()` gesture state, so
// the rest of the app reads typed signals instead of the raw action shape.
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
}
