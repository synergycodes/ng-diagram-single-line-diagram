import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  NgDiagramMinimapComponent,
  NgDiagramViewportService,
  type MinimapNodeStyleFn,
} from 'ng-diagram';
import { CheatSheetComponent } from '../cheat-sheet/cheat-sheet.component';
import { IconComponent } from '../../shared/icons';

// Multiplicative zoom factor per button press. 1.2 = +20% in / -20% out per
// click — gentle enough to feel stepwise, used as `1 / ZOOM_STEP` for zoom-out.
const ZOOM_STEP = 1.2;

// Floating canvas controls: zoom in/out/reset/fit, plus toggles for the minimap
// and the keyboard cheat-sheet popover.
@Component({
  selector: 'app-zoom-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDiagramMinimapComponent, CheatSheetComponent, IconComponent],
  templateUrl: './zoom-toolbar.component.html',
  styleUrl: './zoom-toolbar.component.scss',
})
export class ZoomToolbarComponent {
  protected readonly viewport = inject(NgDiagramViewportService);

  // Optional caller-supplied colouring for minimap nodes; forwarded to the minimap.
  readonly minimapNodeStyle = input<MinimapNodeStyleFn | undefined>(undefined);

  protected readonly minimapOpen = signal(false);

  protected readonly cheatSheetOpen = signal(false);

  // Scale (1 = 100%) shown as a rounded percentage in the toolbar label.
  protected readonly zoomPercent = computed(() => Math.round(this.viewport.scale() * 100));

  protected zoomIn(): void {
    this.viewport.zoom(ZOOM_STEP);
  }

  protected zoomOut(): void {
    this.viewport.zoom(1 / ZOOM_STEP);
  }

  // Snap back to 100% while keeping the current pan position.
  protected resetZoom(): void {
    const current = this.viewport.viewport();
    this.viewport.setViewport(current.x, current.y, 1);
  }

  // Frame the whole diagram, leaving an 80px gutter around the content.
  protected fit(): void {
    this.viewport.zoomToFit({ padding: 80 });
  }

  protected toggleMinimap(): void {
    this.minimapOpen.update((open) => !open);
  }

  protected toggleCheatSheet(): void {
    this.cheatSheetOpen.update((open) => !open);
  }
}
