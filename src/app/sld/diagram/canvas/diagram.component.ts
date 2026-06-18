import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgDiagramActionsAdapter } from '../core/ng-diagram-bridge/ng-diagram-actions.adapter';
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
  type NodeRotateEndedEvent,
  type SelectionMovedEvent,
  type SelectionRemovedEvent,
} from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import { SldControlEdgeComponent } from '../core/edges/control-edge/control-edge.component';
import {
  applyDeleteCleanup,
  createJunctionPortRoutingMiddleware,
  DanglingEndpointsOverlayComponent,
  JunctionOverlayComponent,
  provideJunctions,
} from '../features/junctions';
import { EdgeReshapeOverlayComponent } from '../features/edge-reshape';
import { LinkDrawService, provideLinking } from '../features/linking';
import { LinkDropPreviewOverlayComponent } from '../features/link-drop-preview';
import { provideRelink, RelinkGestureService, RelinkOverlayComponent } from '../features/relink';
import {
  portKind,
  SLD_CONTROL_LINK_EDGE_TYPE,
  SLD_JUNCTION_NODE_TYPE,
  SLD_SYMBOL_NODE_TYPE,
} from '../core/geometry/node-types';
import { SldJunctionNodeComponent } from '../core/nodes/junction-node/junction-node.component';
import { SldSymbolNodeComponent } from '../core/nodes/symbol-node/symbol-node.component';
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
  providers: [
    ...provideJunctions(),
    ...provideLinking(),
    ...provideRelink(),
    NgDiagramActionsAdapter,
    SvgExportService,
  ],
  host: {
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
  private readonly actions = inject(NgDiagramActionsAdapter);
  private readonly linkDraw = inject(LinkDrawService);
  private readonly relinkGesture = inject(RelinkGestureService);
  // The navbar Export button reaches these through the bridge.
  private readonly svgExport = inject(SvgExportService);
  private readonly svgDownload = inject(SvgDownloadService);
  private readonly exportBridge = inject(ExportBridgeService);
  private readonly schematicName = inject(SchematicNameService);

  // A port-to-port draw (ng-diagram) or a relink-handle drag is in flight.
  protected readonly isLinkingGesture = computed(
    () => this.actions.isLinkingActive() || this.relinkGesture.active(),
  );

  protected readonly gestureKind = computed(() => {
    const relinkKind = this.relinkGesture.sourceKind();
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
    [SLD_JUNCTION_NODE_TYPE, SldJunctionNodeComponent],
  ]);

  // Power edges use ng-diagram's default-edge (no `type`).
  readonly edgeTemplateMap = new NgDiagramEdgeTemplateMap([
    [SLD_CONTROL_LINK_EDGE_TYPE, SldControlEdgeComponent],
  ]);

  // Registers the SLD-specific junction port-routing middleware on top of
  // ng-diagram's defaults.
  readonly middlewares = createMiddlewares((defaults) => [
    ...defaults,
    createJunctionPortRoutingMiddleware(),
  ]);

  readonly config = buildDiagramConfig({
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

  async onNodeRotateEnded(event: NodeRotateEndedEvent): Promise<void> {
    const nodeId = event.node.id;
    await this.ngDiagramService.transaction(
      () => this.ngDiagramService.invalidateMeasurements({ nodes: [{ nodeId }] }),
      { waitForMeasurements: true },
    );
    applyEdgeStretchOnSelectionMoved(this.modelService, new Set([nodeId]));
  }

  onSelectionMoved(event: SelectionMovedEvent): void {
    const movedNodeIds = new Set<string>();
    for (const node of event.nodes) movedNodeIds.add(node.id);
    applyEdgeStretchOnSelectionMoved(this.modelService, movedNodeIds);
  }

  // Resolve a freshly drawn edge's drop (port / junction / edge-split) via the
  // linking feature.
  onEdgeDrawEnded(event: EdgeDrawEndedEvent): void {
    this.linkDraw.handleEdgeDrawDrop(event);
  }

  onSelectionRemoved(event: SelectionRemovedEvent): void {
    applyDeleteCleanup(
      {
        modelService: this.modelService,
        ngDiagramService: this.ngDiagramService,
      },
      event,
    );
  }
}
