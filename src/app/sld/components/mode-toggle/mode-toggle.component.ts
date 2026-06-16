import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  DiagramModeService,
  DIAGRAM_MODES,
  type DiagramMode,
} from '../../diagram/core/mode/diagram-mode.service';

// Segmented control that switches the active diagram interaction mode
// (e.g. sketch vs. linking) via DiagramModeService.
@Component({
  selector: 'app-mode-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mode-toggle.component.html',
  styleUrl: './mode-toggle.component.scss',
})
export class ModeToggleComponent {
  private readonly modeService = inject(DiagramModeService);

  protected readonly mode = this.modeService.mode;

  // Built from the mode strategies so label/description aren't duplicated here.
  protected readonly options = DIAGRAM_MODES.map((strategy) => ({
    value: strategy.id,
    label: strategy.label,
    title: `${strategy.label} mode — ${strategy.description} (M to toggle)`,
  }));

  protected select(value: DiagramMode): void {
    this.modeService.setMode(value);
  }
}
