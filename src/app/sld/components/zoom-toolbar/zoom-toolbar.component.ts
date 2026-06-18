import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  NgDiagramMinimapComponent,
  NgDiagramViewportService,
  type MinimapNodeStyleFn,
} from 'ng-diagram';
import { CheatSheetComponent } from '../cheat-sheet/cheat-sheet.component';
import { IconComponent } from '../../shared/icons';

// Multiplicative zoom factor per button press (1.2 = ±20%).
const ZOOM_STEP = 1.2;

// Floating canvas zoom + view controls.
@Component({
  selector: 'app-zoom-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDiagramMinimapComponent, CheatSheetComponent, IconComponent],
  templateUrl: './zoom-toolbar.component.html',
  styleUrl: './zoom-toolbar.component.scss',
})
export class ZoomToolbarComponent {
  protected readonly viewport = inject(NgDiagramViewportService);

  readonly minimapNodeStyle = input<MinimapNodeStyleFn | undefined>(undefined);

  protected readonly minimapOpen = signal(false);

  protected readonly cheatSheetOpen = signal(false);

  protected readonly zoomPercent = computed(() => Math.round(this.viewport.scale() * 100));

  protected zoomIn(): void {
    this.viewport.zoom(ZOOM_STEP);
  }

  protected zoomOut(): void {
    this.viewport.zoom(1 / ZOOM_STEP);
  }

  protected resetZoom(): void {
    const current = this.viewport.viewport();
    this.viewport.setViewport(current.x, current.y, 1);
  }

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
