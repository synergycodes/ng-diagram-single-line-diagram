import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormlyFieldConfig, FormlyForm } from '@ngx-formly/core';
import { NgDiagramModelService, NgDiagramSelectionService, type Node } from 'ng-diagram';
import { isSymbolNode, type SldSymbolNodeData } from '../diagram/geometry/node-types';
import { SymbolRegistryService } from '../symbols/symbol-registry.service';
import { fieldFromPropertyDef } from './formly/field-from-property-def';

type PropertyModel = Record<string, string | number | boolean>;

@Component({
  selector: 'app-properties-panel',
  imports: [ReactiveFormsModule, FormlyForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Collapse out of the floating layout entirely when nothing is selected.
  host: { '[class.is-empty]': '!selectedNode()' },
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.scss',
})
export class PropertiesPanelComponent {
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);
  private readonly sanitizer = inject(DomSanitizer);

  // The single selected SLD symbol node, or null. Recomputes on every selection
  // change (an in-place edit re-emits the node), but its identity only changes
  // when a different node is selected.
  protected readonly selectedNode = computed<Node<SldSymbolNodeData> | null>(() => {
    const { nodes } = this.selectionService.selection();
    const single = nodes.length === 1 ? nodes[0] : null;
    return single && isSymbolNode(single) ? single : null;
  });

  protected readonly selectedSymbolDef = computed(() => {
    const node = this.selectedNode();
    return node ? (this.registry.getById(node.data.symbolId) ?? null) : null;
  });

  // Header title = instance tag (e.g. "Q1"); subtitle = device type (the label).
  protected readonly title = computed(() => {
    const tag = this.selectedNode()?.data.properties['tag'];
    if (typeof tag === 'string' && tag.trim()) return tag.trim();
    return this.selectedSymbolDef()?.label ?? 'Symbol';
  });

  protected readonly subtitle = computed(() => this.selectedSymbolDef()?.label ?? '');

  // Body-only preview for the header thumbnail (no leads — keeps the 40px tile
  // legible). Mirrors `SldSymbolNodeComponent.bodySvgHtml`.
  protected readonly thumbnailSvg = computed<SafeHtml | null>(() => {
    const def = this.selectedSymbolDef();
    if (!def) return null;
    const { x, y, width, height } = def.bodyViewBox;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" ` +
      `preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" ` +
      `width="100%" height="100%" overflow="visible">${def.svgBody}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });

  // Fields depend on the symbol definition, not the property values, so they
  // stay referentially stable across edits (the registry returns a stable def
  // reference) and Formly does not rebuild the field list mid-keystroke.
  protected readonly fields = computed<FormlyFieldConfig[]>(() => {
    const def = this.selectedSymbolDef();
    return def ? def.propertySchema.map((property) => fieldFromPropertyDef(property)) : [];
  });

  // FormGroup isn't signal-native and Formly mutates the model in place, so both
  // are rebuilt imperatively (only on node-identity change; see the effect).
  // Exposed as signals so the OnPush view tracks them.
  protected readonly form = signal(new FormGroup({}));
  protected readonly model = signal<PropertyModel>({});

  private readonly selectedNodeId = computed(() => this.selectedNode()?.id ?? null);

  constructor() {
    // Rebuild the form only when the bound node identity changes. Keying the
    // effect on the id (a memoized computed) means an in-place edit, which
    // re-emits the same id, does not rebuild the FormGroup and drop focus.
    effect(() => {
      this.selectedNodeId();
      const node = untracked(() => this.selectedNode());
      this.rebuildForm(node);
    });
  }

  private rebuildForm(node: Node<SldSymbolNodeData> | null): void {
    this.form.set(new FormGroup({}));
    this.model.set(node ? { ...node.data.properties } : {});
  }

  // Close button — deselects, which collapses the panel (`:host(.is-empty)`).
  protected close(): void {
    this.selectionService.deselectAll();
  }

  protected onModelChange(model: PropertyModel): void {
    const current = this.selectedNode();
    if (!current) return;

    this.modelService.updateNodeData<SldSymbolNodeData>(current.id, {
      symbolId: current.data.symbolId,
      orientation: current.data.orientation,
      properties: { ...current.data.properties, ...model },
    });
  }
}
