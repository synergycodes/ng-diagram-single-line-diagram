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
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import {
  buildSymbolEntry,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type CategoryGroup,
  type LibraryEntry,
} from './library-entries';
import { IconComponent } from '../../shared/icons';

// Drag-source palette: lists registry symbols, grouped by category, with search
// and per-category collapse. Items are dragged onto the canvas.
@Component({
  selector: 'app-symbol-library',
  imports: [NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './symbol-library.component.html',
  styleUrl: './symbol-library.component.scss',
})
export class SymbolLibraryComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly registry = inject(SymbolRegistryService);

  readonly collapse = output<void>();

  readonly query = signal('');

  private readonly sanitize = (svg: string) => this.sanitizer.bypassSecurityTrustHtml(svg);

  private readonly allEntries = computed<readonly LibraryEntry[]>(() =>
    this.registry.symbols().map((def) => buildSymbolEntry(def, this.sanitize)),
  );

  readonly groups = computed<readonly CategoryGroup[]>(() => {
    const query = this.query().trim().toLowerCase();
    const matches = (entry: LibraryEntry) =>
      !query || entry.label.toLowerCase().includes(query) || entry.id.includes(query);
    return CATEGORY_ORDER.map<CategoryGroup>((categoryId) => ({
      id: categoryId,
      label: CATEGORY_LABELS[categoryId],
      entries: this.allEntries().filter((entry) => entry.category === categoryId && matches(entry)),
    })).filter((group) => group.entries.length > 0);
  });

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  // Absent id = expanded. An active search query force-expands every group
  // so matches are never hidden behind a fold.
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
