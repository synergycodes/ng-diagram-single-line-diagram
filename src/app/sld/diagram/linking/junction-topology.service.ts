import { Injectable, inject } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramService,
  type Edge,
  type EdgeDrawEndedEvent,
  type Node,
  type Point,
} from 'ng-diagram';
import { endpointWorldPosition } from '../connectivity/junction-cleanup';
import {
  findDanglingEndpoints,
  SNAP_TO_DANGLING_PX,
  type DanglingEndpoint,
} from '../connectivity/dangling-endpoints';
import { findEdgeSplitHit, splitPolylineAt, type EdgeSplitHit } from '../connectivity/edge-split';
import { GRID } from '../geometry/constants';
import { mintFormerParentId, mintJunctionId, mintLinkId } from '../geometry/id-factory';
import {
  edgeKind,
  isJunctionNode,
  SLD_JUNCTION_NODE_TYPE,
  SLD_JUNCTION_PORT_IDS,
  SLD_JUNCTION_SIZE_PX,
  pickJunctionPortId,
  portKind,
  type LinkKind,
  type SldJunctionPortId,
  type SldLinkEdgeData,
} from '../geometry/node-types';
import {
  defaultHalfFallback,
  edgeShape,
  junctionNodeAt,
  junctionPortWorld,
  junctionWorldCentre,
  otherEndWorld,
  pickBranchPortAvoidingHalves,
} from './junction-geometry';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';

// Shared by link-draw and relink so they can hit the same topology ops.
export type BranchEdgeSpec =
  | { readonly kind: 'new'; readonly sourceId: string; readonly sourcePort: string }
  | { readonly kind: 'relink'; readonly edgeId: string; readonly side: 'source' | 'target' };

// Atomic ops on the link/junction graph: attach, split, merge, dangle.
@Injectable()
export class JunctionTopologyService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly ngDiagramService = inject(NgDiagramService);
  private readonly registry = inject(SymbolRegistryService);

  // Same-kind gating: power/control branches see only their own graph.
  branchKind(branch: BranchEdgeSpec): LinkKind {
    if (branch.kind === 'new') {
      const node = this.modelService.getNodeById(branch.sourceId);
      return portKind(node, branch.sourcePort, (id) => this.registry.getById(id)) ?? 'power';
    }
    const edge = this.modelService.getEdgeById(branch.edgeId);
    return edge ? edgeKind(edge) : 'power';
  }

  junctionKind(junction: Node): LinkKind {
    return isJunctionNode(junction) ? (junction.data?.kind ?? 'power') : 'power';
  }

  findNearbyJunction(point: Point, range: number, kind: LinkKind): Node | null {
    let best: Node | null = null;
    let bestDistSq = range * range;
    for (const node of this.modelService.nodes()) {
      if (node.type !== SLD_JUNCTION_NODE_TYPE || !node.size) continue;
      if (this.junctionKind(node) !== kind) continue;
      const cx = node.position.x + node.size.width / 2;
      const cy = node.position.y + node.size.height / 2;
      const dx = cx - point.x;
      const dy = cy - point.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = node;
      }
    }
    return best;
  }

  findNearbyDanglingEndpoint(point: Point, kind: LinkKind): DanglingEndpoint | null {
    const matchingEdges = this.modelService.edges().filter((edge) => edgeKind(edge) === kind);
    const endpoints = findDanglingEndpoints(matchingEdges);
    let bestDistSq = SNAP_TO_DANGLING_PX * SNAP_TO_DANGLING_PX;
    let best: DanglingEndpoint | null = null;
    for (const endpoint of endpoints) {
      const dx = endpoint.position.x - point.x;
      const dy = endpoint.position.y - point.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = endpoint;
      }
    }
    return best;
  }

  // Drop priority: nearby junction → dangling endpoint → split hit edge →
  // leave dangling. Junction is checked first so `findEdgeSplitHit` doesn't
  // match a branch edge and spawn a duplicate junction.
  handleEdgeDrawDrop(event: EdgeDrawEndedEvent): void {
    if (event.success) return;
    if (event.reason !== 'noTarget') return;
    if (!event.sourcePort) return;

    const branch: BranchEdgeSpec = {
      kind: 'new',
      sourceId: event.source.id,
      sourcePort: event.sourcePort,
    };
    const kind = this.branchKind(branch);

    const nearbyJunction = this.findNearbyJunction(event.dropPosition, SLD_JUNCTION_SIZE_PX, kind);
    if (nearbyJunction) {
      this.attachToJunction(branch, nearbyJunction);
      return;
    }

    const dangling = this.findNearbyDanglingEndpoint(event.dropPosition, kind);
    if (dangling) {
      this.mergeAtDanglingEndpoint(branch, dangling);
      return;
    }

    const sameKindEdges = this.modelService.edges().filter((edge) => edgeKind(edge) === kind);
    const hit = findEdgeSplitHit(sameKindEdges, event.dropPosition, GRID, GRID);
    if (hit) {
      this.splitEdgeAtHit(branch, hit);
      return;
    }

    this.setBranchToDangling(branch, event.dropPosition);
  }

  attachToJunction(branch: BranchEdgeSpec, junction: Node): void {
    const centre = junctionWorldCentre(junction);
    const branchOtherEnd = this.branchOtherEndWorld(branch);
    const portId = branchOtherEnd
      ? pickJunctionPortId(centre, branchOtherEnd)
      : SLD_JUNCTION_PORT_IDS.top;
    this.applyBranch(branch, junction.id, portId);
  }

  // Materialise a junction at `snapPoint` and split the parent into two
  // `manual` halves that inherit its exact polyline — keeps reshape and
  // avoids auto re-routing that would add unwanted bends. Halves share a
  // fresh `formerParentId` so cleanup can merge them back later.
  splitEdgeAtHit(branch: BranchEdgeSpec, hit: EdgeSplitHit): void {
    const parentEdge = hit.edge;
    if (!parentEdge.points || parentEdge.points.length < 2) return;

    const junctionId = mintJunctionId();
    const centre = hit.snapPoint;

    const { firstHalf, secondHalf } = splitPolylineAt(
      parentEdge.points,
      hit.segmentIndex,
      hit.snapPoint,
    );

    // Pick ports from each half's neighbour direction (not splitAxis) so
    // a seam-at-bend lands on the right axis. Collision fallback uses
    // splitAxis defaults — rare U-shape case.
    const segStart = parentEdge.points[hit.segmentIndex];
    const segEnd = parentEdge.points[hit.segmentIndex + 1];
    const splitAxis: 'horizontal' | 'vertical' =
      Math.abs(segStart.y - segEnd.y) < Math.abs(segStart.x - segEnd.x) ? 'horizontal' : 'vertical';
    const halfANeighbour = firstHalf[firstHalf.length - 2];
    const halfBNeighbour = secondHalf[1];
    let halfASidePort = pickJunctionPortId(centre, halfANeighbour);
    let halfBSidePort = pickJunctionPortId(centre, halfBNeighbour);
    if (halfASidePort === halfBSidePort) {
      halfASidePort = defaultHalfFallback(splitAxis, 'a');
      halfBSidePort = defaultHalfFallback(splitAxis, 'b');
    }

    const branchOtherEnd = this.branchOtherEndWorld(branch);
    const branchSidePort = pickBranchPortAvoidingHalves(
      splitAxis,
      centre,
      branchOtherEnd,
      new Set<SldJunctionPortId>([halfASidePort, halfBSidePort]),
    );

    // Slide seam endpoints from `snap` onto the actual port coords
    // (centre ± JUNCTION_SIZE/2). Slide is along the half's last segment
    // axis, so orthogonality is preserved.
    const halfAPortWorld = junctionPortWorld(centre, halfASidePort);
    const halfBPortWorld = junctionPortWorld(centre, halfBSidePort);
    firstHalf[firstHalf.length - 1] = { x: halfAPortWorld.x, y: halfAPortWorld.y };
    secondHalf[0] = { x: halfBPortWorld.x, y: halfBPortWorld.y };

    const formerParentId = mintFormerParentId();
    const kind = edgeKind(parentEdge);

    this.ngDiagramService.transaction(() => {
      this.modelService.addNodes([junctionNodeAt(centre, junctionId, kind)]);
      this.modelService.deleteEdges([parentEdge.id]);
      this.modelService.addEdges([
        {
          ...edgeShape(kind),
          id: mintLinkId(),
          source: parentEdge.source,
          sourcePort: parentEdge.sourcePort,
          sourcePosition: parentEdge.source === '' ? parentEdge.sourcePosition : undefined,
          target: junctionId,
          targetPort: halfASidePort,
          routingMode: 'manual',
          points: firstHalf,
          data: { formerParentId, kind } satisfies SldLinkEdgeData,
        },
        {
          ...edgeShape(kind),
          id: mintLinkId(),
          source: junctionId,
          sourcePort: halfBSidePort,
          target: parentEdge.target,
          targetPort: parentEdge.targetPort,
          targetPosition: parentEdge.target === '' ? parentEdge.targetPosition : undefined,
          routingMode: 'manual',
          points: secondHalf,
          data: { formerParentId, kind } satisfies SldLinkEdgeData,
        },
      ]);
      this.applyBranch(branch, junctionId, branchSidePort);
    });
  }

  // Spawns a junction at the dangling endpoint and re-anchors both edges.
  // No `formerParentId` — no parent path to merge back to.
  mergeAtDanglingEndpoint(branch: BranchEdgeSpec, existing: DanglingEndpoint): void {
    const junctionId = mintJunctionId();
    const centre = existing.position;
    const kind = this.branchKind(branch);

    const existingEdge = this.modelService.getEdgeById(existing.edgeId);
    const existingOtherEnd = existingEdge
      ? otherEndWorld(this.modelService, existingEdge, existing.side)
      : null;
    const existingPort: SldJunctionPortId = existingOtherEnd
      ? pickJunctionPortId(centre, existingOtherEnd)
      : SLD_JUNCTION_PORT_IDS.top;

    const branchOtherEnd = this.branchOtherEndWorld(branch);
    const branchPort: SldJunctionPortId = branchOtherEnd
      ? pickJunctionPortId(centre, branchOtherEnd)
      : SLD_JUNCTION_PORT_IDS.top;

    const existingEdgePatch =
      existing.side === 'target'
        ? {
            target: junctionId,
            targetPort: existingPort,
            targetPosition: undefined,
          }
        : {
            source: junctionId,
            sourcePort: existingPort,
            sourcePosition: undefined,
          };

    this.ngDiagramService.transaction(() => {
      this.modelService.addNodes([junctionNodeAt(centre, junctionId, kind)]);
      this.modelService.updateEdge(existing.edgeId, existingEdgePatch);
      this.applyBranch(branch, junctionId, branchPort);
    });
  }

  setBranchToDangling(branch: BranchEdgeSpec, dropPosition: Point): void {
    const kind = this.branchKind(branch);
    if (branch.kind === 'new') {
      this.modelService.addEdges([
        {
          ...edgeShape(kind),
          id: mintLinkId(),
          source: branch.sourceId,
          sourcePort: branch.sourcePort,
          target: '',
          targetPosition: dropPosition,
          data: { kind } satisfies SldLinkEdgeData,
        },
      ]);
      return;
    }
    // Reset to 'auto' so a prior reshape doesn't freeze the polyline.
    const patch: Partial<Edge> =
      branch.side === 'target'
        ? {
            target: '',
            targetPort: undefined,
            targetPosition: dropPosition,
            routingMode: 'auto',
          }
        : {
            source: '',
            sourcePort: undefined,
            sourcePosition: dropPosition,
            routingMode: 'auto',
          };
    this.modelService.updateEdge(branch.edgeId, patch);
  }

  private applyBranch(branch: BranchEdgeSpec, junctionId: string, port: SldJunctionPortId): void {
    const kind = this.branchKind(branch);
    if (branch.kind === 'new') {
      this.modelService.addEdges([
        {
          ...edgeShape(kind),
          id: mintLinkId(),
          source: branch.sourceId,
          sourcePort: branch.sourcePort,
          target: junctionId,
          targetPort: port,
          data: { kind } satisfies SldLinkEdgeData,
        },
      ]);
      return;
    }
    const patch: Partial<Edge> =
      branch.side === 'target'
        ? {
            target: junctionId,
            targetPort: port,
            targetPosition: undefined,
          }
        : {
            source: junctionId,
            sourcePort: port,
            sourcePosition: undefined,
          };
    this.modelService.updateEdge(branch.edgeId, patch);
  }

  private branchOtherEndWorld(branch: BranchEdgeSpec): Point | null {
    if (branch.kind === 'new') {
      return endpointWorldPosition(this.modelService, branch.sourceId, undefined);
    }
    const edge = this.modelService.getEdgeById(branch.edgeId);
    if (!edge) return null;
    return otherEndWorld(this.modelService, edge, branch.side);
  }
}
