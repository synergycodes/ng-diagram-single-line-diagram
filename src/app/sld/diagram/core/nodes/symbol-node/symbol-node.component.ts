import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
  NgDiagramService,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { SymbolRegistryService } from '../../../../symbols/symbol-registry.service';
import type { LinkKind, TerminalSide } from '../../../../symbols/types';
import { DiagramModeService } from '../../mode/diagram-mode.service';
import { CONTROL_DASHARRAY, STROKE_WIDTH } from '../../geometry/constants';
import { leadLocal, terminalBboxPct, terminalEffectiveSide } from '../../geometry/symbol-geometry';
import type { SldSymbolNodeData, SymbolOrientation } from '../../geometry/node-types';

// A drawn lead line (body edge -> terminal) in wrapper-local SVG coordinates.
interface LeadGeometry {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly kind: LinkKind;
}

// A native ng-diagram port placed at a terminal, positioned as a % of the bbox.
interface PortDescriptor {
  readonly id: string;
  readonly side: TerminalSide;
  readonly kind: LinkKind;
  readonly xPct: number;
  readonly yPct: number;
}

/**
 * Renders body + dynamic leads. Rotation is stored in `data.orientation`
 * (NOT `node.angle`, which would hide the resize adornment) — the wrapper
 * holding body+leads keeps the unrotated dimensions and CSS-rotates inside
 * the bbox, with `node.size` width/height swapped for 90°/270°.
 */
@Component({
  selector: 'app-sld-symbol-node',
  imports: [NgDiagramNodeResizeAdornmentComponent, NgDiagramPortComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: NgDiagramNodeSelectedDirective, inputs: ['node'] }],
  host: {
    '[class.ng-diagram-port-hoverable-over-node]': 'true',
    '[style.--sel-box-side]': 'selectionBoxSide()',
  },
  templateUrl: './symbol-node.component.html',
  styleUrl: './symbol-node.component.scss',
})
export class SldSymbolNodeComponent implements NgDiagramNodeTemplate<SldSymbolNodeData> {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly registry = inject(SymbolRegistryService);
  private readonly diagramService = inject(NgDiagramService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly modeService = inject(DiagramModeService);

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
  // tracks the symbol's size. Rotation-invariant (max of w/h).
  protected readonly selectionBoxSide = computed(() => {
    const { width, height } = this.bbox();
    const side = Math.max(width, height);
    return side > 0 ? `${side + 12}px` : '100%';
  });

  protected readonly orientation = computed<SymbolOrientation>(
    () => this.node().data.orientation ?? 0,
  );

  // ng-diagram's port-position cache is keyed off `ResizeObserver` on port
  // size, but CSS-repositioning a 0×0 port doesn't change its size.
  // Resize the host instead and invalidate explicitly. See
  // https://www.ngdiagram.dev/docs/guides/nodes/ports#port-measurement.
  private readonly portMeasureSync = afterNextRender(() => {
    let firstFire = true;
    const resizeObserver = new ResizeObserver(() => {
      // ResizeObserver fires once on initial observe; ng-diagram has
      // already measured this node by then.
      if (firstFire) {
        firstFire = false;
        return;
      }
      if (!this.diagramService.isInitialized()) return;
      this.diagramService.invalidateMeasurements({ nodes: [{ nodeId: this.node().id }] });
    });
    resizeObserver.observe(this.hostElement.nativeElement);
    this.destroyRef.onDestroy(() => resizeObserver.disconnect());
  });

  // Unrotated box (body + leads) centred in the bbox; CSS rotates it in place.
  // Width/height swap at 90°/270° so the box still fits the (already-swapped) bbox.
  protected readonly wrapperRect = computed(() => {
    const orientation = this.orientation();
    const bbox = this.bbox();
    const swap = orientation === 90 || orientation === 270;
    const width = swap ? bbox.height : bbox.width;
    const height = swap ? bbox.width : bbox.height;
    return {
      left: (bbox.width - width) / 2,
      top: (bbox.height - height) / 2,
      width,
      height,
    };
  });

  protected readonly wrapperTransform = computed(() => `rotate(${this.orientation()}deg)`);

  // Fixed-size symbol body centred in the wrapper; leads fill the gap to the edge.
  protected readonly bodyRect = computed(() => {
    const symbol = this.symbol();
    const wrapper = this.wrapperRect();
    if (!symbol) return { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: (wrapper.width - symbol.body.width) / 2,
      top: (wrapper.height - symbol.body.height) / 2,
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
    const wrapper = this.wrapperRect();
    if (!symbol) return [];
    const body = this.bodyRect();
    return symbol.terminals.map(
      (terminal): LeadGeometry => ({
        id: terminal.id,
        kind: terminal.kind ?? 'power',
        ...leadLocal(terminal, wrapper, body),
      }),
    );
  });

  // Bbox-frame port descriptors (NOT wrapper-frame) so we don't need to
  // repeat the rotation math in CSS. Hidden in sketch mode by CSS.
  protected readonly ports = computed<readonly PortDescriptor[]>(() => {
    const symbol = this.symbol();
    const bbox = this.bbox();
    if (!symbol || bbox.width === 0 || bbox.height === 0) return [];
    const orientation = this.orientation();
    return symbol.terminals.map((terminal): PortDescriptor => {
      const { xPct, yPct } = terminalBboxPct(terminal, bbox, orientation);
      return {
        id: terminal.id,
        side: terminalEffectiveSide(terminal.side, orientation),
        kind: terminal.kind ?? 'power',
        xPct,
        yPct,
      };
    });
  });

  readonly tagLabel = computed(() => {
    const tag = this.node().data.properties['tag'];
    return typeof tag === 'string' ? tag : '';
  });

  // First side without a terminal, priority `right > bottom > left > top`.
  // Right is the SLD convention for vertical inline devices.
  protected readonly tagSide = computed<TerminalSide>(() => {
    const symbol = this.symbol();
    if (!symbol) return 'right';
    const orientation = this.orientation();
    const occupied = new Set<TerminalSide>(
      symbol.terminals.map((terminal) => terminalEffectiveSide(terminal.side, orientation)),
    );
    const priority: readonly TerminalSide[] = ['right', 'bottom', 'left', 'top'];
    return priority.find((side) => !occupied.has(side)) ?? 'right';
  });

  // A side gets a resize handle iff it has a terminal AND the bbox
  // extends past the body on that axis (a lead exists to lengthen).
  protected readonly resizeSides = computed<ReadonlySet<TerminalSide>>(() => {
    const symbol = this.symbol();
    const wrapper = this.wrapperRect();
    if (!symbol) return new Set();
    const hasYLead = wrapper.height > symbol.body.height;
    const hasXLead = wrapper.width > symbol.body.width;
    const orientation = this.orientation();
    const sides = new Set<TerminalSide>();
    for (const terminal of symbol.terminals) {
      const isVerticalSide = terminal.side === 'top' || terminal.side === 'bottom';
      if (isVerticalSide ? hasYLead : hasXLead) {
        sides.add(terminalEffectiveSide(terminal.side, orientation));
      }
    }
    return sides;
  });
}
