import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramSelectionService,
  NgDiagramService,
  NgDiagramViewportService,
  type Point,
} from 'ng-diagram';
import { GRID, POSITION_TOLERANCE_PX } from '../../../../core/geometry/constants';
import { portWorldPosition } from '../../../../core/geometry/port-position';
import { collapseCollinearBends, dropSameAxisBends } from '../../../../core/geometry/edge-stretch';
import { PointerDragController } from '../../../../core/ng-diagram-bridge/pointer-drag-controller';
import {
  findReshapeableSegments,
  reshapeAnchoredSegment,
  type ReshapeEndpointKind,
  type ReshapeSegment,
} from '../../edge-reshape';
import { EDGE_RESHAPE_EXTENSION, type ReshapeDragContext } from '../../reshape-extension';
import { IconComponent } from '../../../../../shared/icons';

interface HandleDescriptor extends ReshapeSegment {
  readonly edgeId: string;
}

interface DragState {
  readonly edgeId: string;
  readonly segmentIndex: number;
  readonly axis: 'horizontal' | 'vertical';
  readonly propagateToFreeEnd: 'source' | 'target' | null;
  readonly anchorPortAtSource: boolean;
  readonly anchorPortAtTarget: boolean;
  readonly initialPoints: { readonly x: number; readonly y: number }[];
  readonly initialClientX: number;
  readonly initialClientY: number;
  // Opaque baseline from the reshape extension (null = no free-end propagation).
  readonly propagation: unknown;
}

// Reshape handles on every orthogonal segment of a selected edge. Drag flips to
// `routingMode: 'manual'` and first/last segments anchor port ends. A free end
// (e.g. a junction) is dragged with its segment; what happens to whatever sits
// on that end is delegated entirely to an optional ReshapeExtension.
@Component({
  selector: 'app-edge-reshape-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './edge-reshape-overlay.component.html',
  styleUrl: './edge-reshape-overlay.component.scss',
})
export class EdgeReshapeOverlayComponent {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly ngDiagramService = inject(NgDiagramService);
  // Optional: lets another feature (here: junctions) teach reshape about free
  // ends and propagate the reshape across them. Absent → plain port reshaping.
  private readonly extension = inject(EDGE_RESHAPE_EXTENSION, { optional: true });

  // Handle-bound, no frame coalescing: the reshape compute is light and the
  // grabbed handle stays mounted through the gesture (the L-bend mask keeps its
  // track key).
  private readonly drag = new PointerDragController<DragState>(
    {
      onMove: (event, state) => this.applyPointerMove(event, state),
      onEnd: (event, state) => this.finishReshape(event, state),
      onTeardown: () => this.gestureActive.set(false),
    },
    { listenerTarget: 'handle', coalesce: false },
  );

  // Masks L-bend insertions so the `@for track segmentIndex` doesn't
  // remap the grabbed DOM element off the cursor mid-drag.
  private readonly gestureActive = signal(false);

  constructor() {
    // Release capture + clear the mask if destroyed mid-drag.
    inject(DestroyRef).onDestroy(() => this.drag.teardown());
  }

  protected readonly handles = computed<readonly HandleDescriptor[]>(() => {
    const drag = this.drag.current;
    const gestureOn = this.gestureActive();
    const selection = this.selectionService.selection();
    const handles: HandleDescriptor[] = [];
    for (const edge of selection.edges) {
      const sourceKind = this.classifyEndpoint(edge.source);
      const targetKind = this.classifyEndpoint(edge.target);
      const isDragged = !!drag && gestureOn && drag.edgeId === edge.id;
      if (isDragged && drag) {
        const segments = findReshapeableSegments(edge.points, sourceKind, targetKind);
        for (const segment of this.maskInjectedBends(segments, drag, edge.points?.length ?? 0)) {
          handles.push({ edgeId: edge.id, ...segment });
        }
      } else {
        const segments = findReshapeableSegments(
          this.normalizeRoute(edge.points),
          sourceKind,
          targetKind,
        );
        for (const segment of segments) {
          handles.push({ edgeId: edge.id, ...segment });
        }
      }
    }
    return handles;
  });

  // Drop L-bends injected this gesture and shift the remaining indices so
  // the dragged handle keeps its original track key.
  private maskInjectedBends(
    segments: readonly ReshapeSegment[],
    drag: DragState,
    liveLen: number,
  ): ReshapeSegment[] {
    const initialLen = drag.initialPoints.length;
    const lengthDiff = liveLen - initialLen;
    if (lengthDiff <= 0) return segments.slice();

    const sourceBendInserted =
      drag.anchorPortAtSource && drag.segmentIndex === 0 && lengthDiff >= 1;
    const targetBendInserted =
      drag.anchorPortAtTarget &&
      drag.segmentIndex === initialLen - 2 &&
      lengthDiff >= (sourceBendInserted ? 2 : 1);

    const targetBendLiveIndex = liveLen - 2;
    const result: ReshapeSegment[] = [];
    for (const segment of segments) {
      if (sourceBendInserted && segment.segmentIndex === 0) continue;
      if (targetBendInserted && segment.segmentIndex === targetBendLiveIndex) continue;
      const remapped = sourceBendInserted
        ? { ...segment, segmentIndex: segment.segmentIndex - 1 }
        : segment;
      result.push(remapped);
    }
    return result;
  }

  // Delegate endpoint classification to the extension; without one, an edge end
  // is anchored when connected, dangling when loose — never free.
  private classifyEndpoint(nodeId: string): ReshapeEndpointKind {
    if (this.extension) return this.extension.classifyEndpoint(nodeId);
    return nodeId ? 'anchored' : 'dangling';
  }

  // Fold collinear vertices so a visually straight run is one reshape segment.
  private normalizeRoute(points: readonly Point[] | undefined): Point[] {
    if (!points) return [];
    return dropSameAxisBends(collapseCollinearBends(points));
  }

  protected readonly transform = computed(() => {
    const viewport = this.viewportService.viewport();
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  });

  protected onPointerDown(event: PointerEvent, handle: HandleDescriptor): void {
    // Stop ng-diagram from treating this as selection / box-select.
    event.stopPropagation();
    event.preventDefault();

    const edge = this.modelService.getEdgeById(handle.edgeId);
    if (!edge?.points) return;

    const initialPoints = this.normalizeRoute(edge.points);
    if (initialPoints.length < 2) return;
    if (initialPoints.length !== edge.points.length) {
      this.modelService.updateEdge(handle.edgeId, {
        points: initialPoints,
        routingMode: 'manual',
      });
    }
    const ctx: ReshapeDragContext = {
      edgeId: handle.edgeId,
      axis: handle.axis,
      segmentIndex: handle.segmentIndex,
      propagateToFreeEnd: handle.propagateToFreeEnd,
      initialPoints,
    };

    const handleEl = event.currentTarget as HTMLElement;
    this.gestureActive.set(true);
    this.drag.begin(event, handleEl, {
      edgeId: handle.edgeId,
      segmentIndex: handle.segmentIndex,
      axis: handle.axis,
      propagateToFreeEnd: handle.propagateToFreeEnd,
      anchorPortAtSource: handle.anchorPortAtSource,
      anchorPortAtTarget: handle.anchorPortAtTarget,
      initialPoints,
      initialClientX: event.clientX,
      initialClientY: event.clientY,
      // Hand the extension the same folded route the indices refer to.
      propagation: this.extension?.snapshot({ ...edge, points: initialPoints }, ctx) ?? null,
    });
  }

  private applyPointerMove(event: PointerEvent, drag: DragState): void {
    const scale = this.viewportService.scale() || 1;
    const dxWorld = (event.clientX - drag.initialClientX) / scale;
    const dyWorld = (event.clientY - drag.initialClientY) / scale;

    const newPoints = reshapeAnchoredSegment(
      drag.initialPoints,
      drag.segmentIndex,
      drag.axis,
      dxWorld,
      dyWorld,
      GRID,
      drag.anchorPortAtSource,
      drag.anchorPortAtTarget,
    );

    // Snap endpoints to LIVE ports so port drift doesn't freeze into the
    // route. Capture each end-segment's axis first so we can rebuild
    // the stub orthogonally after the anchor shift.
    const sourceAxisBeforeAnchor = neighborAxis(newPoints, 'source');
    const targetAxisBeforeAnchor = neighborAxis(newPoints, 'target');
    this.anchorEndpointToPort(newPoints, drag.edgeId, 'source', drag.propagateToFreeEnd);
    this.anchorEndpointToPort(newPoints, drag.edgeId, 'target', drag.propagateToFreeEnd);
    realignEndpointNeighbor(newPoints, 'source', sourceAxisBeforeAnchor);
    realignEndpointNeighbor(newPoints, 'target', targetAxisBeforeAnchor);
    // Mops up diagonals when the dragged segment had a same-axis sibling.
    const orthoPoints = orthogonalizePolyline(newPoints);

    if (drag.propagation != null && this.extension) {
      // Edge + the extension's edits (free-node move, partner re-route) must
      // commit atomically — siblings routed against partial state visibly
      // detach mid-drag.
      this.ngDiagramService.transaction(() => {
        this.modelService.updateEdge(drag.edgeId, {
          points: orthoPoints,
          routingMode: 'manual',
        });
        this.extension!.apply(drag.propagation, drag, orthoPoints);
      });
    } else {
      // Direct commit — a transaction wrap has been observed to detach
      // manual endpoints from their ports under continuous drag.
      this.modelService.updateEdge(drag.edgeId, {
        points: orthoPoints,
        routingMode: 'manual',
      });
    }
  }

  // Replace the end vertex with the live port world position. Skipped on the
  // side being propagated (that one follows its free node, via the extension).
  private anchorEndpointToPort(
    points: { x: number; y: number }[],
    edgeId: string,
    side: 'source' | 'target',
    propagateToFreeEnd: 'source' | 'target' | null,
  ): void {
    if (propagateToFreeEnd === side) return;
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return;
    const nodeId = side === 'source' ? edge.source : edge.target;
    const portId = side === 'source' ? edge.sourcePort : edge.targetPort;
    if (!nodeId || !portId) return;
    const node = this.modelService.getNodeById(nodeId);
    const anchor = portWorldPosition(node, portId);
    if (!anchor) return;
    const idx = side === 'source' ? 0 : points.length - 1;
    points[idx] = anchor;
  }

  private finishReshape(event: PointerEvent, drag: DragState): void {
    // Fold redundant bends now (deferred from pointerMove). The controller
    // already cleared the gesture, so the recompute sees no L-bend mask.
    this.collapseAfterReshape(drag);
    // Prevent the trailing click from deselecting the edge.
    event.stopPropagation();
  }

  // Dragged edge only — collapsing the partner mid-flight detaches its endpoint.
  private collapseAfterReshape(drag: DragState): void {
    const edge = this.modelService.getEdgeById(drag.edgeId);
    if (!edge?.points || edge.points.length < 3) return;
    // Strict-collinear pass folds zero-length L-bends; same-axis pass
    // catches consecutive bends left sub-grid-misaligned by the reshape.
    const collapsed = dropSameAxisBends(collapseCollinearBends(edge.points));
    if (collapsed.length === edge.points.length) return;
    this.modelService.updateEdge(drag.edgeId, {
      points: collapsed,
      routingMode: 'manual',
    });
  }
}

// Orthogonal axis of the end-segment, or null if oblique / too short.
function neighborAxis(
  points: readonly { readonly x: number; readonly y: number }[],
  side: 'source' | 'target',
): 'horizontal' | 'vertical' | null {
  if (points.length < 2) return null;
  const endIdx = side === 'source' ? 0 : points.length - 1;
  const neighborIdx = side === 'source' ? 1 : points.length - 2;
  const end = points[endIdx];
  const neighbor = points[neighborIdx];
  const sameX = Math.abs(end.x - neighbor.x) < POSITION_TOLERANCE_PX;
  const sameY = Math.abs(end.y - neighbor.y) < POSITION_TOLERANCE_PX;
  if (sameX && !sameY) return 'vertical';
  if (sameY && !sameX) return 'horizontal';
  return null;
}

// Snap the anchored end-point's neighbour onto the captured axis to undo
// sub-pixel port drift. No-op for oblique end-segments.
function realignEndpointNeighbor(
  points: { x: number; y: number }[],
  side: 'source' | 'target',
  axis: 'horizontal' | 'vertical' | null,
): void {
  if (axis === null) return;
  if (points.length < 2) return;
  const endIdx = side === 'source' ? 0 : points.length - 1;
  const neighborIdx = side === 'source' ? 1 : points.length - 2;
  if (axis === 'vertical') {
    points[neighborIdx].x = points[endIdx].x;
  } else {
    points[neighborIdx].y = points[endIdx].y;
  }
}

// Replace each oblique segment with a vertical-first L-bend. PointerUp
// collapse later folds any bend that turns out collinear.
function orthogonalizePolyline(
  points: readonly { readonly x: number; readonly y: number }[],
): { x: number; y: number }[] {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const result: { x: number; y: number }[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const sameX = Math.abs(prev.x - curr.x) < POSITION_TOLERANCE_PX;
    const sameY = Math.abs(prev.y - curr.y) < POSITION_TOLERANCE_PX;
    if (sameX || sameY) {
      result.push({ x: curr.x, y: curr.y });
      continue;
    }
    // Vertical-first matches SLD's top/bottom-port convention.
    result.push({ x: prev.x, y: curr.y });
    result.push({ x: curr.x, y: curr.y });
  }
  return result;
}
