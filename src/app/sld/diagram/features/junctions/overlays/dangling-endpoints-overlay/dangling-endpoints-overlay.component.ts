import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgDiagramModelService, NgDiagramViewportService } from 'ng-diagram';
import { DiagramModeService } from '../../../../core/mode/diagram-mode.service';
import { NgDiagramActionsAdapter } from '../../../../core/ng-diagram-bridge/ng-diagram-actions.adapter';
import { findDanglingEndpoints, SNAP_TO_DANGLING_PX } from '../../graph/dangling-endpoints';

// Drop indicators for dangling endpoints — visible only during a linking gesture.
@Component({
  selector: 'app-dangling-endpoints-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dangling-endpoints-overlay.component.html',
  styleUrl: './dangling-endpoints-overlay.component.scss',
})
export class DanglingEndpointsOverlayComponent {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly actions = inject(NgDiagramActionsAdapter);
  private readonly modeService = inject(DiagramModeService);

  protected readonly endpoints = computed(() => findDanglingEndpoints(this.modelService.edges()));

  // Only modes that show drop zones (linking) surface these — defensive, since
  // sketch mode shouldn't fire a linking gesture anyway.
  protected readonly visible = computed(() => {
    if (!this.modeService.current().showsDanglingDropZones) return false;
    return this.actions.isLinkingActive();
  });

  // Returns -1 when no endpoint qualifies. Purely visual feedback.
  protected readonly highlightedIndex = computed(() => {
    const cursor = this.actions.linkingCursorWorld();
    if (!cursor) return -1;
    const list = this.endpoints();
    let best = -1;
    let bestDistSq = SNAP_TO_DANGLING_PX * SNAP_TO_DANGLING_PX;
    for (let i = 0; i < list.length; i++) {
      const dx = list[i].position.x - cursor.x;
      const dy = list[i].position.y - cursor.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = i;
      }
    }
    return best;
  });

  protected readonly transform = computed(() => {
    const viewport = this.viewportService.viewport();
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  });
}
