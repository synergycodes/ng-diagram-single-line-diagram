import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
} from '@angular/core';
import { DiagramModeService } from '../mode/diagram-mode.service';
import { DiagramStateStorageService } from '../mode/diagram-state-storage.service';
import { NgDiagramActionsAdapter } from '../ng-diagram-bridge/ng-diagram-actions.adapter';
import { SpatialBoundsRefresherService } from '../ng-diagram-bridge/spatial-bounds-refresher.service';
import { SvgExportService } from '../export/svg-export.service';
import { SvgDownloadService } from '../export/svg-download.service';
import { ExportBridgeService } from '../export/export-bridge.service';
import { SchematicNameService } from '../../schematic-name.service';
import {
  createMiddlewares,
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramEdgeTemplateMap,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  NgDiagramSelectionService,
  NgDiagramService,
  type DiagramInitEvent,
  type EdgeDrawEndedEvent,
  type Node,
  type NodeDragEndedEvent,
  type NodeResizeEndedEvent,
  type PaletteItemDroppedEvent,
  type SelectionMovedEvent,
  type SelectionRemovedEvent,
} from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import { SldControlEdgeComponent } from '../edges/control-edge/control-edge.component';
import { ConnectivityService } from '../connectivity/connectivity.service';
import { DanglingEndpointsOverlayComponent } from '../connectivity/dangling-endpoints-overlay/dangling-endpoints-overlay.component';
import { applyDeleteCleanup } from '../connectivity/delete-cleanup';
import { JunctionOverlayComponent } from '../connectivity/junction-overlay/junction-overlay.component';
import { EdgeReshapeOverlayComponent } from '../edge-reshape/edge-reshape-overlay/edge-reshape-overlay.component';
import { JunctionTopologyService } from '../linking/junction-topology.service';
import { LinkDropPreviewOverlayComponent } from '../link-drop-preview/link-drop-preview-overlay/link-drop-preview-overlay.component';
import { RelinkOverlayComponent } from '../relink/relink-overlay/relink-overlay.component';
import { GRID } from '../geometry/constants';
import {
  portKind,
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  SLD_SYMBOL_NODE_TYPE,
  SLD_WIRE_NODE_TYPE,
} from '../geometry/node-types';
import { rotateSymbolPatch } from '../geometry/rotation';
import { findWireSnap } from '../geometry/wire-snap';
import { createAspectLockMiddleware } from '../middlewares/aspect-lock.middleware';
import { createDragGroupMiddleware } from '../middlewares/drag-group.middleware';
import { createJunctionPortRoutingMiddleware } from '../middlewares/junction-port-routing.middleware';
import { SldJunctionNodeComponent } from '../nodes/junction-node/junction-node.component';
import { SldSymbolNodeComponent } from '../nodes/symbol-node/symbol-node.component';
import { SldWireNodeComponent } from '../nodes/wire-node/wire-node.component';
import { applyEdgeStretchOnSelectionMoved } from '../routing/edge-stretch-on-move';
import { ZoomToolbarComponent } from '../../zoom-toolbar/zoom-toolbar.component';
import { buildDiagramConfig } from '../ng-diagram-bridge/diagram-config';
import { buildMinimapNodeStyle } from '../ng-diagram-bridge/minimap-node-style';

const SNAP_GUARD_RELEASE_MS = 50;

@Component({
  selector: 'app-diagram',
  imports: [
    NgDiagramComponent,
    NgDiagramBackgroundComponent,
    DanglingEndpointsOverlayComponent,
    EdgeReshapeOverlayComponent,
    JunctionOverlayComponent,
    LinkDropPreviewOverlayComponent,
    RelinkOverlayComponent,
    ZoomToolbarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here so they inherit the diagram subtree's ng-diagram services.
  providers: [
    ConnectivityService,
    DiagramStateStorageService,
    JunctionTopologyService,
    NgDiagramActionsAdapter,
    SpatialBoundsRefresherService,
    SvgExportService,
  ],
  host: {
    '[class.is-alt-drag]': 'isAltDrag()',
    '[class.mode-linking]': 'modeService.isLinking()',
    '[class.is-linking-gesture]': 'isLinkingGesture()',
    '[class.is-linking-power]': "gestureKind() === 'power'",
    '[class.is-linking-control]': "gestureKind() === 'control'",
  },
  templateUrl: './diagram.component.html',
  styleUrl: './diagram.component.scss',
})
export class DiagramComponent {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly ngDiagramService = inject(NgDiagramService);
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly registry = inject(SymbolRegistryService);
  // protected — host-class binding reads it from template metadata.
  protected readonly modeService = inject(DiagramModeService);
  private readonly actions = inject(NgDiagramActionsAdapter);
  private readonly topology = inject(JunctionTopologyService);
  private readonly spatialBounds = inject(SpatialBoundsRefresherService);
  // Eager-injected so its mode-change effect subscribes before the user
  // can toggle. Also gates `onSelectionRemoved` via `isSwapping()`.
  private readonly stateStorage = inject(DiagramStateStorageService);
  // SVG export wiring — the navbar Export button reaches it through the bridge.
  private readonly svgExport = inject(SvgExportService);
  private readonly svgDownload = inject(SvgDownloadService);
  private readonly exportBridge = inject(ExportBridgeService);
  private readonly schematicName = inject(SchematicNameService);

  // Mode flip toggles port visibility — ResizeObserver misses show/hide.
  private readonly modeMeasurementSync = effect(() => {
    this.modeService.mode();
    if (!this.ngDiagramService.isInitialized()) return;
    this.ngDiagramService.invalidateMeasurements();
  });

  // Guards against the snap-triggered selectionMoved cascade.
  private isApplyingSnap = false;

  // Nodes the Alt-drag group middleware moved this tick (outside the
  // selection). Read by `onSelectionMoved` to scope the edge-stretch walk.
  private altDragGroup: ReadonlySet<string> = new Set<string>();

  protected readonly isAltDrag = this.actions.isAltDragging;

  protected readonly isLinkingGesture = computed(
    () => this.actions.isLinkingActive() || this.modeService.relinkGestureActive(),
  );

  // Source kind during a linking or relink gesture — for the host class.
  protected readonly gestureKind = computed(() => {
    const relinkKind = this.modeService.relinkSourceKind();
    if (relinkKind) return relinkKind;
    if (!this.actions.isLinkingActive()) return null;
    const nodeId = this.actions.linkingSourceNodeId();
    if (!nodeId) return null;
    const portId = this.actions.linkingSourcePortId();
    const node = this.modelService.getNodeById(nodeId);
    return portKind(node, portId ?? null, (id) => this.registry.getById(id));
  });

  readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    [SLD_SYMBOL_NODE_TYPE, SldSymbolNodeComponent],
    [SLD_WIRE_NODE_TYPE, SldWireNodeComponent],
    [SLD_JUNCTION_NODE_TYPE, SldJunctionNodeComponent],
  ]);

  // Power edges use ng-diagram's default-edge (no `type`).
  readonly edgeTemplateMap = new NgDiagramEdgeTemplateMap([
    [SLD_CONTROL_LINK_EDGE_TYPE, SldControlEdgeComponent],
  ]);

  readonly middlewares = createMiddlewares((defaults) => [
    ...defaults,
    createAspectLockMiddleware({
      grid: GRID,
      getSymbol: (id) => this.registry.getById(id),
    }),
    createDragGroupMiddleware({
      getSymbol: (id) => this.registry.getById(id),
      onActiveGroupChange: (movedNodeIds) => (this.altDragGroup = movedNodeIds),
    }),
    createJunctionPortRoutingMiddleware(),
  ]);

  readonly config = buildDiagramConfig({
    modeService: this.modeService,
    registry: this.registry,
    modelService: this.modelService,
  });

  readonly model = initializeModel({ nodes: [], edges: [] });

  protected readonly minimapNodeStyle = buildMinimapNodeStyle(this.registry);

  protected onDiagramInit(_event: DiagramInitEvent): void {
    // Expose SVG export to page-level chrome (the navbar Export button).
    // File name follows the current schematic name.
    this.exportBridge.register(() =>
      this.svgDownload.download(this.svgExport.exportToSvg(), this.schematicName.fileName()),
    );
  }

  onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
    void this.trySnapNode(event.node);
    this.spatialBounds.refresh();
  }

  onNodeDragEnded(_event: NodeDragEndedEvent): void {
    this.spatialBounds.refresh();
  }

  onNodeResizeEnded(_event: NodeResizeEndedEvent): void {
    this.spatialBounds.refresh();
  }

  onSelectionMoved(event: SelectionMovedEvent): void {
    for (const node of event.nodes) {
      void this.trySnapNode(node);
    }
    // Stretch only edges incident to a moved node: the selection itself, plus
    // the Alt-drag group (which the middleware moved outside the selection).
    const movedNodeIds = new Set<string>();
    for (const node of event.nodes) movedNodeIds.add(node.id);
    if (this.actions.isAltDragging()) {
      for (const id of this.altDragGroup) movedNodeIds.add(id);
    }
    applyEdgeStretchOnSelectionMoved(this.modelService, movedNodeIds);
  }

  onEdgeDrawEnded(event: EdgeDrawEndedEvent): void {
    if (this.modeService.isLinking()) {
      this.topology.handleEdgeDrawDrop(event);
    }
  }

  onSelectionRemoved(event: SelectionRemovedEvent): void {
    // Mode-swap batch-deletes everything — that's a replacement, not a
    // user delete. Skipping prevents bogus orphan demotion / merge-back.
    if (this.stateStorage.isSwapping()) return;
    applyDeleteCleanup(
      {
        modelService: this.modelService,
        ngDiagramService: this.ngDiagramService,
      },
      event,
    );
  }

  // `R` rotates selected symbols 90° CW; `M` toggles mode. Skipped when typing.
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.matches('input, textarea, select') || target.isContentEditable)) {
      return;
    }

    if (event.key === 'm' || event.key === 'M') {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      this.modeService.toggle();
      return;
    }

    if (event.key !== 'r' && event.key !== 'R') return;
    const selectedSymbols = this.selectionService
      .selection()
      .nodes.filter((node: Node) => node.type === SLD_SYMBOL_NODE_TYPE);
    if (selectedSymbols.length === 0) return;
    event.preventDefault();
    for (const node of selectedSymbols) {
      const patch = rotateSymbolPatch(node);
      if (patch) this.modelService.updateNode(node.id, patch);
    }
    this.spatialBounds.refresh();
  }

  private async trySnapNode(node: Node): Promise<void> {
    if (this.isApplyingSnap) return;

    // Alt-drag carries the connected component — snapping the anchor
    // would leave the trailing group behind.
    if (this.actions.isAltDragging()) return;

    const snap = findWireSnap(node, this.modelService.nodes(), (id) => this.registry.getById(id));
    if (!snap || (snap.delta.x === 0 && snap.delta.y === 0)) return;

    this.isApplyingSnap = true;
    try {
      this.modelService.updateNode(node.id, {
        position: {
          x: node.position.x + snap.delta.x,
          y: node.position.y + snap.delta.y,
        },
      });
    } finally {
      // Defer past the cascading `selectionMoved` from our own update.
      setTimeout(() => {
        this.isApplyingSnap = false;
      }, SNAP_GUARD_RELEASE_MS);
    }
  }
}
