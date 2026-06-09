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
import { GRID, POSITION_TOLERANCE_PX } from '../../geometry/constants';
import { SLD_JUNCTION_NODE_TYPE } from '../../geometry/node-types';
import { portWorldPosition } from '../../geometry/port-position';
import { PointerDragController } from '../../ng-diagram-bridge/pointer-drag-controller';
import { collapseCollinearBends, dropSameAxisBends } from '../../routing/edge-stretch';
import {
  findReshapeableSegments,
  reshapeAnchoredSegment,
  type EndpointKind,
  type ReshapeSegment,
} from '../edge-reshape';
import {
  findCollinearPartnerSegment,
  junctionEndDelta,
  sharesFormerParent,
} from '../junction-propagation';

interface HandleDescriptor extends ReshapeSegment {
  readonly edgeId: string;
}

// Baseline captured at pointerDown — projecting against this avoids
// compounding the drag delta tick-over-tick.
interface PropagationSnapshot {
  readonly junctionId: string;
  readonly initialJunctionPosition: Point;
  readonly partnerEdgeId: string | null;
  readonly partnerInitialPoints: readonly Point[] | null;
  readonly partnerSegmentIndex: number | null;
  readonly partnerJunctionEnd: 'source' | 'target' | null;
}

interface DragState {
  readonly edgeId: string;
  readonly segmentIndex: number;
  readonly axis: 'horizontal' | 'vertical';
  readonly propagateToJunction: 'source' | 'target' | null;
  readonly anchorPortAtSource: boolean;
  readonly anchorPortAtTarget: boolean;
  readonly initialPoints: { readonly x: number; readonly y: number }[];
  readonly initialClientX: number;
  readonly initialClientY: number;
  readonly propagation: PropagationSnapshot | null;
}

// Reshape handles on every orthogonal segment of a selected edge. Drag
// flips to `routingMode: 'manual'`; first/last segments anchor port ends,
// drag junction ends along with the partner half of a former-parent split.
@Component({
  selector: 'app-edge-reshape-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edge-reshape-overlay.component.html',
  styleUrl: './edge-reshape-overlay.component.scss',
})
export class EdgeReshapeOverlayComponent {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly ngDiagramService = inject(NgDiagramService);

  // Handle-bound, no rAF: the reshape compute is light and the grabbed handle
  // stays mounted through the gesture (the L-bend mask keeps its track key).
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
      const segments = findReshapeableSegments(edge.points, sourceKind, targetKind);
      const isDragged = !!drag && gestureOn && drag.edgeId === edge.id;
      if (isDragged && drag) {
        for (const segment of this.maskInjectedBends(segments, drag, edge.points?.length ?? 0)) {
          handles.push({ edgeId: edge.id, ...segment });
        }
      } else {
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

  private classifyEndpoint(nodeId: string): EndpointKind {
    if (!nodeId) return 'dangling';
    const node = this.modelService.getNodeById(nodeId);
    if (node?.type === SLD_JUNCTION_NODE_TYPE) return 'junction';
    return 'port';
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

    const handleEl = event.currentTarget as HTMLElement;
    this.gestureActive.set(true);
    this.drag.begin(event, handleEl, {
      edgeId: handle.edgeId,
      segmentIndex: handle.segmentIndex,
      axis: handle.axis,
      propagateToJunction: handle.propagateToJunction,
      anchorPortAtSource: handle.anchorPortAtSource,
      anchorPortAtTarget: handle.anchorPortAtTarget,
      initialPoints: edge.points.map((p) => ({ x: p.x, y: p.y })),
      initialClientX: event.clientX,
      initialClientY: event.clientY,
      propagation: this.snapshotPropagation(edge, handle),
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
    // polyline. Capture each end-segment's axis first so we can rebuild
    // the stub orthogonally after the anchor shift.
    const sourceAxisBeforeAnchor = neighborAxis(newPoints, 'source');
    const targetAxisBeforeAnchor = neighborAxis(newPoints, 'target');
    this.anchorEndpointToPort(newPoints, drag.edgeId, 'source', drag.propagateToJunction);
    this.anchorEndpointToPort(newPoints, drag.edgeId, 'target', drag.propagateToJunction);
    realignEndpointNeighbor(newPoints, 'source', sourceAxisBeforeAnchor);
    realignEndpointNeighbor(newPoints, 'target', targetAxisBeforeAnchor);
    // Mops up diagonals when the dragged segment had a same-axis sibling.
    const orthoPoints = orthogonalizePolyline(newPoints);

    if (drag.propagateToJunction) {
      // Edge + junction + partner-half must commit atomically — sibling
      // branches routed against partial state visibly detach mid-drag.
      this.ngDiagramService.transaction(() => {
        this.modelService.updateEdge(drag.edgeId, {
          points: orthoPoints,
          routingMode: 'manual',
        });
        this.propagateReshapeAcrossJunction(drag, orthoPoints);
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

  // Resolve junction + collinear partner half (same `formerParentId`,
  // same axis/coord) so propagation has a stable baseline.
  private snapshotPropagation(
    edge: { id: string; source: string; target: string; data?: unknown; points?: readonly Point[] },
    handle: HandleDescriptor,
  ): PropagationSnapshot | null {
    if (!handle.propagateToJunction || !edge.points) return null;
    const junctionId = handle.propagateToJunction === 'source' ? edge.source : edge.target;
    const junction = this.modelService.getNodeById(junctionId);
    if (!junction || junction.type !== SLD_JUNCTION_NODE_TYPE) return null;
    const initialJunctionPosition: Point = {
      x: junction.position.x,
      y: junction.position.y,
    };

    const noPartner: PropagationSnapshot = {
      junctionId,
      initialJunctionPosition,
      partnerEdgeId: null,
      partnerInitialPoints: null,
      partnerSegmentIndex: null,
      partnerJunctionEnd: null,
    };

    // Both halves must share `formerParentId` — independent branches at
    // the same junction aren't propagation partners.
    const candidatePartner = this.modelService
      .getConnectedEdges(junctionId)
      .find((candidate) => candidate.id !== edge.id && sharesFormerParent(edge, candidate));
    if (!candidatePartner) return noPartner;

    const collinear = findCollinearPartnerSegment({
      edge,
      partner: candidatePartner,
      junctionId,
      draggedAxis: handle.axis,
      draggedSegmentIndex: handle.segmentIndex,
    });
    if (!collinear) return noPartner;

    return {
      junctionId,
      initialJunctionPosition,
      partnerEdgeId: candidatePartner.id,
      partnerInitialPoints: candidatePartner.points!.map((p) => ({ x: p.x, y: p.y })),
      partnerSegmentIndex: collinear.partnerSegmentIndex,
      partnerJunctionEnd: collinear.partnerJunctionEnd,
    };
  }

  // Move the junction by the segment's delta and apply the same delta to
  // the partner half — reshape continues across the junction as if the
  // wire were still unsplit.
  private propagateReshapeAcrossJunction(
    drag: DragState,
    newPoints: readonly { x: number; y: number }[],
  ): void {
    const snap = drag.propagation;
    if (!snap) return;
    if (!drag.propagateToJunction) return;

    const { dx: deltaX, dy: deltaY } = junctionEndDelta(
      drag.initialPoints,
      newPoints,
      drag.propagateToJunction,
    );

    this.modelService.updateNode(snap.junctionId, {
      position: {
        x: snap.initialJunctionPosition.x + deltaX,
        y: snap.initialJunctionPosition.y + deltaY,
      },
    });

    // Other manual branches on the junction have frozen `points[]` —
    // flip them to 'auto' so the router re-anchors to the moved port.
    const branchesToReset = this.modelService
      .getConnectedEdges(snap.junctionId)
      .filter(
        (branch) =>
          branch.id !== drag.edgeId &&
          branch.id !== snap.partnerEdgeId &&
          branch.routingMode === 'manual',
      )
      .map((branch) => ({ id: branch.id, routingMode: 'auto' as const }));
    if (branchesToReset.length > 0) {
      this.modelService.updateEdges(branchesToReset);
    }

    if (!snap.partnerEdgeId || !snap.partnerInitialPoints || snap.partnerSegmentIndex === null) {
      return;
    }
    const partnerAnchorPortAtSource = snap.partnerJunctionEnd === 'target';
    const partnerAnchorPortAtTarget = snap.partnerJunctionEnd === 'source';
    const newPartnerPoints = reshapeAnchoredSegment(
      snap.partnerInitialPoints,
      snap.partnerSegmentIndex,
      drag.axis,
      deltaX,
      deltaY,
      GRID,
      partnerAnchorPortAtSource,
      partnerAnchorPortAtTarget,
    );
    const partnerAnchorSide: 'source' | 'target' =
      snap.partnerJunctionEnd === 'source' ? 'target' : 'source';
    this.anchorEndpointToPort(newPartnerPoints, snap.partnerEdgeId, partnerAnchorSide, null);
    this.modelService.updateEdge(snap.partnerEdgeId, {
      points: newPartnerPoints,
      routingMode: 'manual',
    });
  }

  // Replace the end vertex with the live port world position. Skipped on
  // the side being propagated (that one follows the junction).
  private anchorEndpointToPort(
    points: { x: number; y: number }[],
    edgeId: string,
    side: 'source' | 'target',
    propagateToJunction: 'source' | 'target' | null,
  ): void {
    if (propagateToJunction === side) return;
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
    // catches sub-grid misalignments from a junction-merge.
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
