import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramSelectionService,
  NgDiagramService,
  NgDiagramViewportService,
  type Edge,
  type Point,
} from 'ng-diagram';
import { findEdgeSplitHit, type EdgeSplitHit } from '../../connectivity/edge-split';
import { endpointWorldPosition, reconcileJunction } from '../../connectivity/junction-cleanup';
import { DiagramModeService } from '../../mode/diagram-mode.service';
import { GRID, PORT_SNAP_PX } from '../../geometry/constants';
import {
  edgeKind,
  portKind,
  SLD_JUNCTION_NODE_TYPE,
  SLD_JUNCTION_SIZE_PX,
  pickJunctionPortId,
  type LinkKind,
} from '../../geometry/node-types';
import { SymbolRegistryService } from '../../../symbols/symbol-registry.service';
import {
  JunctionTopologyService,
  type BranchEdgeSpec,
} from '../../linking/junction-topology.service';
import { PointerDragController } from '../../ng-diagram-bridge/pointer-drag-controller';

interface RelinkHandle {
  readonly edgeId: string;
  readonly side: 'source' | 'target';
  readonly position: Point;
}

interface DragState {
  readonly edgeId: string;
  readonly side: 'source' | 'target';
  readonly initialPosition: Point;
  readonly initialClientX: number;
  readonly initialClientY: number;
  // Node we left at drag start — reconciled on release.
  readonly originalNodeId: string;
}

// Drag either endpoint of a selected edge. Resolution on drop:
// port (PORT_SNAP_PX) → junction → edge-hit → dangling.
@Component({
  selector: 'app-relink-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './relink-overlay.component.html',
  styleUrl: './relink-overlay.component.scss',
})
export class RelinkOverlayComponent {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly ngDiagramService = inject(NgDiagramService);
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly modeService = inject(DiagramModeService);
  private readonly topology = inject(JunctionTopologyService);
  private readonly registry = inject(SymbolRegistryService);

  // Document-bound + rAF-coalesced: the handle's `@for` can re-render mid-drag
  // during a routing cascade, so listeners can't live on the handle element.
  private readonly drag = new PointerDragController<DragState>(
    {
      onMove: (event, state) => this.applyPointerMove(event, state),
      onEnd: (event, state) => this.resolveDrop(event, state),
      onTeardown: () => this.modeService.setRelinkGestureActive(false),
    },
    { listenerTarget: 'document', coalesce: true },
  );

  // Deferred junction reconcile (see resolveDrop). Cleared on destroy.
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly handles = computed<readonly RelinkHandle[]>(() => {
    const selection = this.selectionService.selection();
    const result: RelinkHandle[] = [];
    for (const edge of selection.edges) {
      const edgePoints = edge.points;
      if (!edgePoints || edgePoints.length < 1) continue;
      // First/last routed points work for both connected and dangling ends.
      result.push({ edgeId: edge.id, side: 'source', position: edgePoints[0] });
      result.push({ edgeId: edge.id, side: 'target', position: edgePoints[edgePoints.length - 1] });
    }
    return result;
  });

  protected readonly transform = computed(() => {
    const viewport = this.viewportService.viewport();
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  });

  constructor() {
    // Tear down an in-flight gesture if the overlay is destroyed mid-drag
    // (selection change, mode swap, route teardown) so the document listeners
    // don't leak and keep mutating the model from a dead instance.
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.drag.teardown());
    destroyRef.onDestroy(() => {
      if (this.reconcileTimer !== null) clearTimeout(this.reconcileTimer);
    });
  }

  protected onPointerDown(event: PointerEvent, handle: RelinkHandle): void {
    event.stopPropagation();
    event.preventDefault();
    const edge = this.modelService.getEdgeById(handle.edgeId);
    if (!edge) return;
    const handleEl = event.currentTarget as HTMLElement;
    this.modeService.setRelinkGestureActive(true);
    this.modeService.setRelinkSourceKind(edgeKind(edge));
    this.drag.begin(event, handleEl, {
      edgeId: handle.edgeId,
      side: handle.side,
      initialPosition: { x: handle.position.x, y: handle.position.y },
      initialClientX: event.clientX,
      initialClientY: event.clientY,
      originalNodeId: handle.side === 'source' ? edge.source : edge.target,
    });
  }

  private applyPointerMove(event: PointerEvent, drag: DragState): void {
    const snappedWorld = this.snappedWorldPosition(drag, event);

    // Live preview: attach to a nearby port so the routed shape shows
    // the snap. Committed for real in `resolveDrop`.
    const port = this.modelService.getNearestPortInRange(snappedWorld, PORT_SNAP_PX);
    if (port && this.isPortAcceptable(drag, port.nodeId, port.id)) {
      const portId = this.directionalPortId(drag, port.nodeId, port.id);
      this.modelService.updateEdge(
        drag.edgeId,
        this.connectedPatch(drag.side, port.nodeId, portId),
      );
      return;
    }

    this.modelService.updateEdge(drag.edgeId, this.danglingPatch(drag.side, snappedWorld));
  }

  private resolveDrop(event: PointerEvent, drag: DragState): void {
    event.stopPropagation();

    const dropWorld = this.snappedWorldPosition(drag, event);
    // Resolution order matches `JunctionTopologyService.handleEdgeDrawDrop`.
    const branch: BranchEdgeSpec = {
      kind: 'relink',
      edgeId: drag.edgeId,
      side: drag.side,
    };
    const dragKind = this.dragKind(drag);
    const port = this.modelService.getNearestPortInRange(dropWorld, PORT_SNAP_PX);
    if (port && this.isPortAcceptable(drag, port.nodeId, port.id)) {
      const portId = this.directionalPortId(drag, port.nodeId, port.id);
      this.modelService.updateEdge(
        drag.edgeId,
        this.connectedPatch(drag.side, port.nodeId, portId),
      );
    } else {
      const nearJunction = this.topology.findNearbyJunction(
        dropWorld,
        SLD_JUNCTION_SIZE_PX,
        dragKind,
      );
      if (nearJunction && this.isPortAcceptable(drag, nearJunction.id, null)) {
        this.topology.attachToJunction(branch, nearJunction);
      } else {
        const hit = this.findEdgeHit(drag.edgeId, dropWorld, dragKind);
        if (hit) this.topology.splitEdgeAtHit(branch, hit);
      }
    }
    // Reconcile the just-left junction AFTER the resolution commits. ng-diagram
    // applies mutations async and model reads lag the commit, so reconciling
    // synchronously runs on the pre-split graph and merges the wrong edges.
    // Defer past the commit so it sees the settled graph.
    const leftNode = drag.originalNodeId;
    this.reconcileTimer = setTimeout(() => {
      reconcileJunction(this.modelService, this.ngDiagramService, leftNode);
    }, 0);
  }

  // Excludes the dragged edge and any cross-kind edges.
  private findEdgeHit(relinkedEdgeId: string, drop: Point, kind: LinkKind): EdgeSplitHit | null {
    const others = this.modelService
      .edges()
      .filter((edge) => edge.id !== relinkedEdgeId && edgeKind(edge) === kind);
    return findEdgeSplitHit(others, drop, GRID, GRID);
  }

  private dragKind(drag: DragState): LinkKind {
    const edge = this.modelService.getEdgeById(drag.edgeId);
    return edge ? edgeKind(edge) : 'power';
  }

  // For junction targets, override the arbitrary nearest-port pick with
  // the side facing the edge's other end.
  private directionalPortId(drag: DragState, targetNodeId: string, defaultPortId: string): string {
    const node = this.modelService.getNodeById(targetNodeId);
    if (!node || node.type !== SLD_JUNCTION_NODE_TYPE) return defaultPortId;
    const edge = this.modelService.getEdgeById(drag.edgeId);
    if (!edge) return defaultPortId;
    const size = node.size ?? { width: 0, height: 0 };
    const centre = {
      x: node.position.x + size.width / 2,
      y: node.position.y + size.height / 2,
    };
    const otherNodeId = drag.side === 'target' ? edge.source : edge.target;
    const otherPosition = drag.side === 'target' ? edge.sourcePosition : edge.targetPosition;
    const otherWorld = endpointWorldPosition(this.modelService, otherNodeId, otherPosition);
    if (!otherWorld) return defaultPortId;
    return pickJunctionPortId(centre, otherWorld);
  }

  private snappedWorldPosition(drag: DragState, event: PointerEvent): Point {
    const scale = this.viewportService.scale() || 1;
    const dxWorld = (event.clientX - drag.initialClientX) / scale;
    const dyWorld = (event.clientY - drag.initialClientY) / scale;
    return {
      x: Math.round((drag.initialPosition.x + dxWorld) / GRID) * GRID,
      y: Math.round((drag.initialPosition.y + dyWorld) / GRID) * GRID,
    };
  }

  // Self-loop + kind guard. `candidatePortId === null` skips the kind
  // check (junction-snap path resolves the port later).
  private isPortAcceptable(
    drag: DragState,
    candidateNodeId: string,
    candidatePortId: string | null,
  ): boolean {
    const edge = this.modelService.getEdgeById(drag.edgeId);
    if (!edge) return false;
    const otherEnd = drag.side === 'target' ? edge.source : edge.target;
    if (otherEnd === candidateNodeId) return false;
    const dragKind = edgeKind(edge);
    const candidateKind = portKind(
      this.modelService.getNodeById(candidateNodeId),
      candidatePortId,
      (id) => this.registry.getById(id),
    );
    return candidateKind === null || candidateKind === dragKind;
  }

  private danglingPatch(side: 'source' | 'target', position: Point): Partial<Edge> {
    // Force 'auto' — manual `points[]` would freeze the handle in place.
    return side === 'target'
      ? { target: '', targetPort: undefined, targetPosition: position, routingMode: 'auto' }
      : { source: '', sourcePort: undefined, sourcePosition: position, routingMode: 'auto' };
  }

  private connectedPatch(side: 'source' | 'target', nodeId: string, portId: string): Partial<Edge> {
    return side === 'target'
      ? { target: nodeId, targetPort: portId, targetPosition: undefined, routingMode: 'auto' }
      : { source: nodeId, sourcePort: portId, sourcePosition: undefined, routingMode: 'auto' };
  }
}
