import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { provideFormlyCore } from '@ngx-formly/core';
import { provideNgDiagram } from 'ng-diagram';
import { DiagramComponent } from '../../diagram/canvas/diagram.component';
import { ExportBridgeService } from '../../diagram/export/export-bridge.service';
import { ModeToggleComponent } from '../../components/mode-toggle/mode-toggle.component';
import { SldFormlyInputType } from '../../components/properties-panel/formly/sld-input.type';
import { SldFormlySelectType } from '../../components/properties-panel/formly/sld-select.type';
import { PropertiesPanelComponent } from '../../components/properties-panel/properties-panel.component';
import { SchematicNameService } from '../../services/schematic-name.service';
import { SymbolLibraryComponent } from '../../components/symbol-library/symbol-library.component';
import { ThemeToggleComponent } from '../../components/theme-toggle/theme-toggle.component';
import { IconComponent } from '../../shared/icons';

@Component({
  selector: 'app-sld-page',
  imports: [
    DiagramComponent,
    ModeToggleComponent,
    PropertiesPanelComponent,
    SymbolLibraryComponent,
    ThemeToggleComponent,
    IconComponent,
  ],
  // ng-diagram services inject ElementRef of the host — must be provided on a component, not at root.
  providers: [
    provideNgDiagram(),
    provideFormlyCore({
      types: [
        { name: 'sld-input', component: SldFormlyInputType },
        { name: 'sld-select', component: SldFormlySelectType },
      ],
    }),
  ],
  templateUrl: './sld-page.component.html',
  styleUrl: './sld-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
// The editor screen: wires together the canvas, palette, properties panel, and
// navbar. Owns only this page's chrome state (palette open, name editing); the
// diagram itself owns its data.
export class SldPageComponent {
  // SVG export lives in the diagram's DI scope; reach it through the bridge.
  private readonly exportBridge = inject(ExportBridgeService);
  protected readonly schematicName = inject(SchematicNameService);

  // Library palette is collapsible — open by default (it's a builder), collapses
  // to the floating grid button to free up canvas.
  protected readonly paletteOpen = signal(true);

  // Gates the navbar Export button until the diagram registers its handler.
  protected readonly exportReady = this.exportBridge.ready;

  // Double-click the navbar doc title to rename the schematic.
  protected readonly editingName = signal(false);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    // Focus + select the field as soon as edit mode shows it.
    effect(() => {
      if (!this.editingName()) return;
      const el = this.nameInput()?.nativeElement;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }

  protected togglePalette(): void {
    this.paletteOpen.update((open) => !open);
  }

  protected exportSvg(): void {
    this.exportBridge.export();
  }

  protected startNameEdit(): void {
    this.editingName.set(true);
  }

  // Enter/blur commit; the guard absorbs the blur that fires on teardown.
  protected commitName(value: string): void {
    if (!this.editingName()) return;
    this.schematicName.rename(value);
    this.editingName.set(false);
  }

  // Escape restores the field, then blurs — so the trailing commit is a no-op.
  protected cancelNameEdit(input: HTMLInputElement): void {
    input.value = this.schematicName.name();
    input.blur();
  }
}
