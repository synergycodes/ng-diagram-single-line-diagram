import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent } from 'ng-diagram';
import { DiagramModeService } from '../diagram/mode/diagram-mode.service';
import { SymbolRegistryService } from '../symbols/symbol-registry.service';
import {
  buildSymbolEntry,
  buildWireEntries,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type CategoryGroup,
  type LibraryEntry,
} from './library-entries';

@Component({
  selector: 'app-symbol-library',
  imports: [NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './symbol-library.component.html',
  styleUrl: './symbol-library.component.scss',
})
export class SymbolLibraryComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly registry = inject(SymbolRegistryService);
  private readonly modeService = inject(DiagramModeService);

  // Emitted by the header collapse button; the page hides the panel.
  readonly collapse = output<void>();

  readonly query = signal('');

  private readonly sanitize = (svg: string) => this.sanitizer.bypassSecurityTrustHtml(svg);

  private readonly allEntries = computed<readonly LibraryEntry[]>(() => [
    ...buildWireEntries(this.sanitize),
    ...this.registry.symbols().map((def) => buildSymbolEntry(def, this.sanitize)),
  ]);

  readonly groups = computed<readonly CategoryGroup[]>(() => {
    const query = this.query().trim().toLowerCase();
    // Wires only make sense in sketch mode — linking mode uses native edges.
    const hideWires = this.modeService.isLinking();
    const matches = (entry: LibraryEntry) =>
      !query || entry.label.toLowerCase().includes(query) || entry.id.includes(query);
    return CATEGORY_ORDER.filter((categoryId) => !(hideWires && categoryId === 'wires'))
      .map<CategoryGroup>((categoryId) => ({
        id: categoryId,
        label: CATEGORY_LABELS[categoryId],
        entries: this.allEntries().filter(
          (entry) => entry.category === categoryId && matches(entry),
        ),
      }))
      .filter((group) => group.entries.length > 0);
  });

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  // Per-category collapse state (absent id = expanded). An active search query
  // force-expands every group so matches are never hidden behind a fold.
  private readonly collapsedCategories = signal<ReadonlySet<string>>(new Set());

  protected isExpanded(categoryId: string): boolean {
    if (this.query().trim().length > 0) return true;
    return !this.collapsedCategories().has(categoryId);
  }

  protected toggleCategory(categoryId: string): void {
    this.collapsedCategories.update((set) => {
      const next = new Set(set);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }
}
