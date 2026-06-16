import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, type Node } from 'ng-diagram';

// ng-diagram 1.2.3 workaround: `measuredBoundsMiddleware` bails on our 0×0
// ports, leaving the spatial hash stale after resize/rotate/move. We wipe
// `measuredBounds` and re-process the hash on gesture-end events.
// REMOVE when ng-diagram exposes `invalidateBounds()`.
@Injectable()
export class SpatialBoundsRefresherService {
  private readonly modelService = inject(NgDiagramModelService);

  private fallbackWarned = false;

  refresh(): void {
    try {
      const flowCore = (
        this.modelService as unknown as {
          flowCore?: { spatialHash?: { process(nodes: readonly Node[]): void } };
        }
      ).flowCore;
      if (!flowCore?.spatialHash) {
        if (!this.fallbackWarned) {
          this.fallbackWarned = true;
          console.warn(
            '[sld] ng-diagram internal `flowCore.spatialHash` not found — port snap may stale after resize. Likely an ng-diagram version bump; see `SpatialBoundsRefresherService` doc.',
          );
        }
        return;
      }
      const nodes = this.modelService.nodes();
      for (const node of nodes) {
        delete (node as { measuredBounds?: unknown }).measuredBounds;
      }
      flowCore.spatialHash.process(nodes);
    } catch (error) {
      if (!this.fallbackWarned) {
        this.fallbackWarned = true;
        console.warn('[sld] SpatialBoundsRefresherService.refresh failed; see service doc.', error);
      }
    }
  }
}
