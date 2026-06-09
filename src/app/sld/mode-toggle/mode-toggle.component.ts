import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DiagramModeService, type DiagramMode } from '../diagram/mode/diagram-mode.service';

interface ModeOption {
  readonly value: DiagramMode;
  readonly label: string;
  readonly title: string;
}

@Component({
  selector: 'app-mode-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mode-toggle.component.html',
  styleUrl: './mode-toggle.component.scss',
})
export class ModeToggleComponent {
  private readonly modeService = inject(DiagramModeService);

  protected readonly mode = this.modeService.mode;

  protected readonly options: readonly ModeOption[] = [
    {
      value: 'linking',
      label: 'Linking',
      title: 'Linking mode — native ng-diagram ports and edges (M to toggle)',
    },
    {
      value: 'sketch',
      label: 'Sketch',
      title: 'Sketch mode — drag wires + symbols, connections derived geometrically (M to toggle)',
    },
  ];

  protected select(value: DiagramMode): void {
    this.modeService.setMode(value);
  }
}
