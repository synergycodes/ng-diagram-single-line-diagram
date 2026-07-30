import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, type EdgeDrawEndedEvent } from 'ng-diagram';
import { JunctionAttachmentService } from '../junctions';
import { findEdgeSplitHit } from '../../core/geometry/edge-split';
import { portWorldPosition } from '../../core/geometry/port-position';
import { SymbolRegistryService } from '../../../symbols/symbol-registry.service';
import { GRID } from '../../core/geometry/constants';
import {
  edgeKind,
  portKind,
  SLD_JUNCTION_SIZE_PX,
  type LinkKind,
} from '../../core/geometry/node-types';
import { NewDrawBranch } from './new-draw-branch';

// Half of ng-diagram's 18px port halo + offset for pointer jitter.
const CLICK_RADIUS_PX = 12;

// Turns a native port-to-port draw into a real connection on drop. Owns only the
// draw-gesture entry point and the resolution ORDER — nearby junction → dangling
// endpoint → split an edge → leave dangling. The junction-graph edits themselves
// are JunctionAttachmentService's; this builds a NewDrawBranch and drives it.
@Injectable()
export class LinkDrawService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);
  private readonly attachment = inject(JunctionAttachmentService);

  // Called from the canvas on `edgeDrawEnded`. Only acts on a draw that ended
  // without a native target (`noTarget`) — a successful port-to-port link is
  // already committed by ng-diagram.
  handleEdgeDrawDrop(event: EdgeDrawEndedEvent): void {
    if (event.success) return;
    if (event.reason !== 'noTarget') return;
    if (!event.sourcePort) return;

    const sourceNode = this.modelService.getNodeById(event.source.id);

    // A draw that ended inside the port's own hitbox is an accidental click,
    // not a wire — ignore it.
    const sourcePos = portWorldPosition(sourceNode, event.sourcePort);
    if (
      sourcePos &&
      Math.hypot(event.dropPosition.x - sourcePos.x, event.dropPosition.y - sourcePos.y) <
        CLICK_RADIUS_PX
    ) {
      return;
    }

    // Same-kind gating: power/control branches see only their own graph.
    const kind: LinkKind =
      portKind(sourceNode, event.sourcePort, (id) => this.registry.getById(id)) ?? 'power';
    const branch = new NewDrawBranch(this.modelService, kind, event.source.id, event.sourcePort);

    // Junction is checked first so findEdgeSplitHit doesn't match a branch edge
    // and spawn a duplicate junction.
    const nearbyJunction = this.attachment.findNearbyJunction(
      event.dropPosition,
      SLD_JUNCTION_SIZE_PX,
      kind,
    );
    if (nearbyJunction) {
      this.attachment.attachToJunction(branch, nearbyJunction);
      return;
    }

    const dangling = this.attachment.findNearbyDanglingEndpoint(event.dropPosition, kind);
    if (dangling) {
      this.attachment.mergeAtDanglingEndpoint(branch, dangling);
      return;
    }

    const sameKindEdges = this.modelService.edges().filter((edge) => edgeKind(edge) === kind);
    const hit = findEdgeSplitHit(sameKindEdges, event.dropPosition, GRID, GRID);
    if (hit) {
      this.attachment.splitEdgeAtHit(branch, hit);
      return;
    }

    branch.leaveDangling(event.dropPosition);
  }
}
