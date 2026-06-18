import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  NgDiagramNodeRotateAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { SymbolRegistryService } from '../../../../symbols/symbol-registry.service';
import type { LinkKind, TerminalSide } from '../../../../symbols/types';
import { CONTROL_DASHARRAY, STROKE_WIDTH } from '../../geometry/constants';
import { leadLocal } from '../../geometry/symbol-geometry';
import type { SldSymbolNodeData } from '../../geometry/node-types';

interface LeadGeometry {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly kind: LinkKind;
}

interface PortDescriptor {
  readonly id: string;
  readonly side: TerminalSide;
  readonly kind: LinkKind;
  readonly xPct: number;
  readonly yPct: number;
}

/**
 * Renders the symbol body, dynamic leads, ports, and instance tag. The tag
 * counter-rotates to stay horizontal as the node rotates.
 */
@Component({
  selector: 'app-sld-symbol-node',
  imports: [NgDiagramNodeRotateAdornmentComponent, NgDiagramPortComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: NgDiagramNodeSelectedDirective, inputs: ['node'] }],
  host: {
    '[class.ng-diagram-port-hoverable-over-node]': 'true',
    '[style.--sel-box-side]': 'selectionBoxSide()',
    '[style.--tag-counter-rot]': 'counterRotation()',
  },
  templateUrl: './symbol-node.component.html',
  styleUrl: './symbol-node.component.scss',
})
export class SldSymbolNodeComponent implements NgDiagramNodeTemplate<SldSymbolNodeData> {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly registry = inject(SymbolRegistryService);

  readonly node = input.required<Node<SldSymbolNodeData>>();

  protected readonly strokeWidth = STROKE_WIDTH;
  protected readonly controlDasharray = CONTROL_DASHARRAY;

  readonly symbol = computed(() => this.registry.getById(this.node().data.symbolId));

  // Value-equal: ng-diagram re-emits `node` per tick, so `node().size` is a
  // fresh reference each frame even when unchanged.
  readonly bbox = computed(() => this.node().size ?? { width: 0, height: 0 }, {
    equal: (a, b) => a.width === b.width && a.height === b.height,
  });

  // Side of the square hover/selection box (CSS `--sel-box-side`): the larger
  // bbox dimension + padding, so the box is always a consistent square that
  // tracks the symbol's size. Rotation-invariant (max of w/h) and centred, so
  // it stays square under the node's rotation.
  protected readonly selectionBoxSide = computed(() => {
    const { width, height } = this.bbox();
    const side = Math.max(width, height);
    return side > 0 ? `${side + 12}px` : '100%';
  });

  // Counter the node's rotation so the instance tag stays horizontal.
  protected readonly counterRotation = computed(() => `${-(this.node().angle ?? 0)}deg`);

  protected readonly bodyRect = computed(() => {
    const symbol = this.symbol();
    const bbox = this.bbox();
    if (!symbol) return { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: (bbox.width - symbol.body.width) / 2,
      top: (bbox.height - symbol.body.height) / 2,
      width: symbol.body.width,
      height: symbol.body.height,
    };
  });

  // Wrap the symbol's raw SVG body in a sized <svg> and trust it for rendering.
  // Source is our own registry (not user input), so bypassing the sanitizer is safe.
  readonly bodySvgHtml = computed(() => {
    const symbol = this.symbol();
    if (!symbol) return '';
    const viewBox = symbol.bodyViewBox;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" ` +
      `preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" width="100%" height="100%">` +
      `${symbol.svgBody}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });

  protected readonly leads = computed<readonly LeadGeometry[]>(() => {
    const symbol = this.symbol();
    const bbox = this.bbox();
    if (!symbol) return [];
    const body = this.bodyRect();
    return symbol.terminals.map(
      (terminal): LeadGeometry => ({
        id: terminal.id,
        kind: terminal.kind ?? 'power',
        ...leadLocal(terminal, bbox, body),
      }),
    );
  });

  protected readonly ports = computed<readonly PortDescriptor[]>(() => {
    const symbol = this.symbol();
    const bbox = this.bbox();
    if (!symbol || bbox.width === 0 || bbox.height === 0) return [];
    return symbol.terminals.map(
      (terminal): PortDescriptor => ({
        id: terminal.id,
        side: terminal.side,
        kind: terminal.kind ?? 'power',
        xPct: terminal.xPct,
        yPct: terminal.yPct,
      }),
    );
  });

  readonly tagLabel = computed(() => {
    const tag = this.node().data.properties['tag'];
    return typeof tag === 'string' ? tag : '';
  });

  // First side without a terminal, priority `right > bottom > left > top`.
  // Computed in the unrotated frame; it rotates with the node to the matching
  // free side. Right is the SLD convention for vertical inline devices.
  protected readonly tagSide = computed<TerminalSide>(() => {
    const symbol = this.symbol();
    if (!symbol) return 'right';
    const occupied = new Set<TerminalSide>(symbol.terminals.map((terminal) => terminal.side));
    const priority: readonly TerminalSide[] = ['right', 'bottom', 'left', 'top'];
    return priority.find((side) => !occupied.has(side)) ?? 'right';
  });
}
