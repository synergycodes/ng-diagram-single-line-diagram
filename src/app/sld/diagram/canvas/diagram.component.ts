import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
} from '@angular/core';
import { DiagramModeService } from '../core/mode/diagram-mode.service';
import { DiagramStateStorageService } from '../core/mode/diagram-state-storage.service';
import { NgDiagramActionsAdapter } from '../core/ng-diagram-bridge/ng-diagram-actions.adapter';
import { SpatialBoundsRefresherService } from '../core/ng-diagram-bridge/spatial-bounds-refresher.service';
import { SvgExportService } from '../export/svg-export.service';
import { SvgDownloadService } from '../export/svg-download.service';
import { ExportBridgeService } from '../export/export-bridge.service';
import { SchematicNameService } from '../../services/schematic-name.service';
import {
  createMiddlewares,
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramEdgeTemplateMap,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  NgDiagramService,
  type DiagramInitEvent,
  type EdgeDrawEndedEvent,
  type NodeDragEndedEvent,
  type NodeResizeEndedEvent,
  type PaletteItemDroppedEvent,
  type SelectionMovedEvent,
  type SelectionRemovedEvent,
} from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import { SldControlEdgeComponent } from '../core/edges/control-edge/control-edge.component';
import {
  applyDeleteCleanup,
  DanglingEndpointsOverlayComponent,
  JunctionOverlayComponent,
  provideJunctions,
} from '../features/junctions';
import { EdgeReshapeOverlayComponent } from '../features/edge-reshape';
import { LinkDrawService, provideLinking } from '../features/linking';
import { LinkDropPreviewOverlayComponent } from '../features/link-drop-preview';
import { RelinkOverlayComponent } from '../features/relink';
import { provideWireSnap, WireSnapController } from '../features/wire-snap';
import { GRID } from '../core/geometry/constants';
import {
  portKind,
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  SLD_SYMBOL_NODE_TYPE,
  SLD_WIRE_NODE_TYPE,
} from '../core/geometry/node-types';
import { DiagramKeyboardService } from '../core/keyboard/diagram-keyboard.service';
import { createAspectLockMiddleware } from '../core/middlewares/aspect-lock.middleware';
import { createDragGroupMiddleware } from '../core/middlewares/drag-group.middleware';
import { createJunctionPortRoutingMiddleware } from '../core/middlewares/junction-port-routing.middleware';
import { SldJunctionNodeComponent } from '../core/nodes/junction-node/junction-node.component';
import { SldSymbolNodeComponent } from '../core/nodes/symbol-node/symbol-node.component';
import { SldWireNodeComponent } from '../core/nodes/wire-node/wire-node.component';
import { applyEdgeStretchOnSelectionMoved } from '../features/edge-routing';
import { ZoomToolbarComponent } from '../../components/zoom-toolbar/zoom-toolbar.component';
import { buildDiagramConfig } from '../core/ng-diagram-bridge/diagram-config';
import { buildMinimapNodeStyle } from '../core/ng-diagram-bridge/minimap-node-style';

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
  // Each feature exposes its own provider set; the rest is diagram-local infra.
  providers: [
    ...provideJunctions(),
    ...provideLinking(),
    ...provideWireSnap(),
    DiagramKeyboardService,
    DiagramStateStorageService,
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
  private readonly registry = inject(SymbolRegistryService);
  // protected — host-class binding reads it from template metadata.
  protected readonly modeService = inject(DiagramModeService);
  private readonly actions = inject(NgDiagramActionsAdapter);
  private readonly linkDraw = inject(LinkDrawService);
  private readonly spatialBounds = inject(SpatialBoundsRefresherService);
  // Feature controllers — the canvas only forwards events to these.
  private readonly wireSnap = inject(WireSnapController);
  private readonly keyboard = inject(DiagramKeyboardService);
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

  // Maps each SLD node type to the component ng-diagram renders for it.
  readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    [SLD_SYMBOL_NODE_TYPE, SldSymbolNodeComponent],
    [SLD_WIRE_NODE_TYPE, SldWireNodeComponent],
    [SLD_JUNCTION_NODE_TYPE, SldJunctionNodeComponent],
  ]);

  // Power edges use ng-diagram's default-edge (no `type`).
  readonly edgeTemplateMap = new NgDiagramEdgeTemplateMap([
    [SLD_CONTROL_LINK_EDGE_TYPE, SldControlEdgeComponent],
  ]);

  // Registers the SLD-specific middlewares on top of ng-diagram's defaults:
  // aspect-lock on resize, Alt-drag group move, and junction port routing.
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

  // Wire-snap the freshly dropped node, then refresh spatial bounds (below).
  onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
    this.wireSnap.trySnap(event.node);
    this.spatialBounds.refresh();
  }

  // After any geometry change, rebuild the spatial index so hit tests (nearest
  // port, edge-split) see the new positions.
  onNodeDragEnded(_event: NodeDragEndedEvent): void {
    this.spatialBounds.refresh();
  }

  onNodeResizeEnded(_event: NodeResizeEndedEvent): void {
    this.spatialBounds.refresh();
  }

  onSelectionMoved(event: SelectionMovedEvent): void {
    for (const node of event.nodes) {
      this.wireSnap.trySnap(node);
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

  // Resolve a freshly drawn edge's drop (port / junction / edge-split) via the
  // linking feature — but only in a mode that permits new connections.
  onEdgeDrawEnded(event: EdgeDrawEndedEvent): void {
    if (this.modeService.current().allowsConnections) {
      this.linkDraw.handleEdgeDrawDrop(event);
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

  // Keyboard shortcuts (rotate, mode toggle) — the canvas only registers the
  // event; the key map lives in DiagramKeyboardService.
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    this.keyboard.handleKeydown(event);
  }
}
