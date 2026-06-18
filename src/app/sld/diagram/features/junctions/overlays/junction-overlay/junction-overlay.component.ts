import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgDiagramViewportService } from 'ng-diagram';
import { JunctionsService } from '../../junctions.service';

/** Junction dot diameter in world pixels at zoom 1×. Scaled with the
 *  viewport so the dot grows / shrinks alongside the rest of the diagram. */
const JUNCTION_DOT_SIZE_PX = 6;

interface DotScreenPlacement {
  /** Screen-space CSS pixel coords of the dot centre. */
  readonly x: number;
  readonly y: number;
  /** Screen-space CSS pixel diameter. */
  readonly size: number;
}

/**
 * Renders connection dots at every point where 3+ wire-continuations meet.
 *
 * Junctions are NOT nodes — they have no `position`/`size`, they're not selectable
 * or draggable. They're a pure visual side-effect of the geometric junction
 * graph, painted in an overlay layer above the ng-diagram canvas.
 *
 * Positioning strategy: each dot's screen coords and size are recomputed in JS
 * from the current viewport (pan + zoom). We deliberately do NOT use the
 * ng-diagram trick of wrapping the dots in a `transform: translate scale`
 * layer — at high zoom that promotes the layer to a GPU bitmap which then
 * gets bilinear-stretched into a visible halo (the small 6 px circle has
 * almost no source resolution to upscale from). Per-dot screen-space
 * placement keeps every circle rasterised at its real on-screen pixel
 * size, so it stays crisp at any zoom level.
 */
@Component({
  selector: 'app-junction-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './junction-overlay.component.html',
  styleUrl: './junction-overlay.component.scss',
})
export class JunctionOverlayComponent {
  private readonly junctionsService = inject(JunctionsService);
  private readonly viewportService = inject(NgDiagramViewportService);

  /** World-junction positions projected into screen pixels. */
  protected readonly dots = computed<readonly DotScreenPlacement[]>(() => {
    const viewport = this.viewportService.viewport();
    const size = JUNCTION_DOT_SIZE_PX * viewport.scale;
    return this.junctionsService.junctions().map((junction) => ({
      x: junction.x * viewport.scale + viewport.x,
      y: junction.y * viewport.scale + viewport.y,
      size,
    }));
  });
}
