import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgDiagramModelService, NgDiagramViewportService } from 'ng-diagram';
import { NgDiagramActionsAdapter } from '../../../../core/ng-diagram-bridge/ng-diagram-actions.adapter';
import { findDanglingEndpoints, SNAP_TO_DANGLING_PX } from '../../graph/dangling-endpoints';

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

  protected readonly endpoints = computed(() => findDanglingEndpoints(this.modelService.edges()));

  protected readonly visible = computed(() => this.actions.isLinkingActive());

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
