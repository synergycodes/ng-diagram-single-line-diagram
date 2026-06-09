import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-cheat-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cheat-sheet.component.html',
  styleUrl: './cheat-sheet.component.scss',
})
export class CheatSheetComponent {
  protected readonly groups: readonly {
    readonly title: string;
    readonly rows: readonly { readonly keys: readonly string[]; readonly label: string }[];
  }[] = [
    {
      title: 'Selection',
      rows: [
        { keys: ['Click'], label: 'Select node or edge' },
        { keys: ['Ctrl', 'Click'], label: 'Add to selection' },
        { keys: ['Shift', 'drag'], label: 'Box-select an area' },
        { keys: ['Ctrl', 'A'], label: 'Select all' },
      ],
    },
    {
      title: 'Editing',
      rows: [
        { keys: ['R'], label: 'Rotate selected symbol 90° CW' },
        { keys: ['Delete'], label: 'Remove selection' },
        { keys: ['Ctrl', 'C'], label: 'Copy' },
        { keys: ['Ctrl', 'V'], label: 'Paste' },
      ],
    },
    {
      title: 'Connections',
      rows: [
        { keys: ['M'], label: 'Toggle linking mode (ports visible)' },
        { keys: ['Alt', 'drag'], label: 'Carry connected group along' },
      ],
    },
    {
      title: 'Canvas',
      rows: [
        { keys: ['Ctrl', 'wheel'], label: 'Zoom in / out' },
        { keys: ['Arrows'], label: 'Pan viewport / move selection' },
        { keys: ['Esc'], label: 'Cancel current gesture' },
      ],
    },
  ];
}
