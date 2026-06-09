import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgDiagramModelService, NgDiagramViewportService, type Point } from 'ng-diagram';
import { findEdgeSplitHit } from '../../connectivity/edge-split';
import { DiagramModeService } from '../../mode/diagram-mode.service';
import { GRID, PORT_SNAP_PX } from '../../geometry/constants';
import { edgeKind, portKind, type LinkKind } from '../../geometry/node-types';
import { portWorldPosition } from '../../geometry/port-position';
import { NgDiagramActionsAdapter } from '../../ng-diagram-bridge/ng-diagram-actions.adapter';
import { SymbolRegistryService } from '../../../symbols/symbol-registry.service';

// Ghost junction preview while a port-to-port draw or relink gesture is in flight, so mid-edge drop is discoverable.
@Component({
  selector: 'app-link-drop-preview-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './link-drop-preview-overlay.component.html',
  styleUrl: './link-drop-preview-overlay.component.scss',
})
export class LinkDropPreviewOverlayComponent {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly actions = inject(NgDiagramActionsAdapter);
  private readonly modeService = inject(DiagramModeService);
  private readonly registry = inject(SymbolRegistryService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly cursorWorld = signal<Point | null>(null);

  protected readonly transform = computed(() => {
    const viewport = this.viewportService.viewport();
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  });

  private readonly active = computed(
    () => this.actions.isLinkingActive() || this.modeService.relinkGestureActive(),
  );

  // Kind of the currently dragged endpoint — relink stores it on the service,
  // native linking resolves it from the source port via the registry.
  private readonly gestureKind = computed<LinkKind | null>(() => {
    const relinkKind = this.modeService.relinkSourceKind();
    if (relinkKind) return relinkKind;
    if (!this.actions.isLinkingActive()) return null;
    const nodeId = this.actions.linkingSourceNodeId();
    const portId = this.actions.linkingSourcePortId();
    if (!nodeId) return null;
    return portKind(this.modelService.getNodeById(nodeId), portId ?? null, (id) =>
      this.registry.getById(id),
    );
  });

  // Excludes the source node of a native linking gesture so a self-loop attempt doesn't pulse on the very port being dragged FROM.
  // Cross-kind ports are also filtered out so the snap preview only shows
  // for compatible targets.
  protected readonly snapTargetPort = computed<Point | null>(() => {
    if (!this.active()) return null;
    const cursor = this.cursorWorld();
    if (!cursor) return null;
    const port = this.modelService.getNearestPortInRange(cursor, PORT_SNAP_PX);
    if (!port) return null;
    const sourceNodeId = this.actions.linkingSourceNodeId();
    if (sourceNodeId && port.nodeId === sourceNodeId) return null;
    const kind = this.gestureKind();
    if (kind) {
      const targetKind = portKind(this.modelService.getNodeById(port.nodeId), port.id, (id) =>
        this.registry.getById(id),
      );
      if (targetKind && targetKind !== kind) return null;
    }
    const node = this.modelService.getNodeById(port.nodeId);
    return portWorldPosition(node ?? null, port.id);
  });

  // Port-snap wins over edge-hit, so suppress the ghost when a port is in range.
  // Also filter the edge hit by gesture kind — splitting a power link with a
  // control branch (or vice versa) is forbidden.
  protected readonly edgeHit = computed<Point | null>(() => {
    if (!this.active()) return null;
    if (this.snapTargetPort()) return null;
    const cursor = this.cursorWorld();
    if (!cursor) return null;
    const kind = this.gestureKind();
    const candidateEdges = kind
      ? this.modelService.edges().filter((edge) => edgeKind(edge) === kind)
      : this.modelService.edges();
    const hit = findEdgeSplitHit(candidateEdges, cursor, GRID, GRID);
    return hit?.snapPoint ?? null;
  });

  constructor() {
    // Document-level so the cursor tracks past the canvas (over a toolbar etc.),
    // rAF-coalesced — each update re-scans every edge in snapTargetPort/edgeHit.
    let pendingEvent: PointerEvent | null = null;
    let rafHandle: number | null = null;
    const onMove = (event: PointerEvent): void => {
      pendingEvent = event;
      if (rafHandle !== null) return;
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        const pending = pendingEvent;
        pendingEvent = null;
        if (!pending) return;
        this.cursorWorld.set(
          this.viewportService.clientToFlowPosition({ x: pending.clientX, y: pending.clientY }),
        );
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointermove', onMove);
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    });
  }
}
