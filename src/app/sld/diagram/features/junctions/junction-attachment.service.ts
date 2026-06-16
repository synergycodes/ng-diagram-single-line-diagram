import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, NgDiagramService, type Node, type Point } from 'ng-diagram';
import { mintFormerParentId, mintJunctionId, mintLinkId } from '../../core/geometry/id-factory';
import {
  edgeKind,
  edgeShape,
  pickJunctionPortId,
  SLD_JUNCTION_PORT_IDS,
  type LinkKind,
  type SldJunctionPortId,
  type SldLinkEdgeData,
} from '../../core/geometry/node-types';
import { otherEndWorld } from '../../core/geometry/port-position';
import { type EdgeSplitHit } from '../../core/geometry/edge-split';
import { type DanglingEndpoint } from './graph/dangling-endpoints';
import {
  computeEdgeSplitPlan,
  findNearbyDanglingEndpointAmong,
  findNearbyJunctionNode,
  junctionNodeAt,
  junctionWorldCentre,
} from './graph/junction-geometry';
import { type DroppedBranch } from './dropped-branch';

/**
 * Resolves where a dropped link endpoint connects into the junction graph and
 * applies the edits: reuse a nearby junction, merge with a loose end, split an
 * edge to create a junction, or (left to the caller) leave it dangling.
 *
 * The consumer passes a `DroppedBranch` describing how its branch commits (a new
 * edge vs. updating an existing one); this service decides where it attaches and
 * performs the junction-graph edits. The resolution ORDER stays with the
 * consumer — a new draw and a relink prioritise differently.
 */
@Injectable()
export class JunctionAttachmentService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly ngDiagramService = inject(NgDiagramService);

  // Nearest same-kind junction within `range`, or null — first drop choice so an
  // existing junction is reused instead of spawning a new one beside it.
  findNearbyJunction(point: Point, range: number, kind: LinkKind): Node | null {
    return findNearbyJunctionNode(this.modelService.nodes(), point, range, kind);
  }

  // Nearest same-kind dangling endpoint within snap range, or null — so two
  // loose ends merge into a junction instead of overlapping.
  findNearbyDanglingEndpoint(point: Point, kind: LinkKind): DanglingEndpoint | null {
    return findNearbyDanglingEndpointAmong(this.modelService.edges(), point, kind);
  }

  // Attach the branch to an existing junction, on the port facing its far end.
  attachToJunction(branch: DroppedBranch, junction: Node): void {
    const centre = junctionWorldCentre(junction);
    const branchOtherEnd = branch.otherEndWorld();
    const portId = branchOtherEnd
      ? pickJunctionPortId(centre, branchOtherEnd)
      : SLD_JUNCTION_PORT_IDS.top;
    branch.attachTo(junction.id, portId);
  }

  // Materialise a junction at the hit point and split the parent into two
  // `manual` halves that inherit its bends (seam ends snapped to junction ports)
  // — keeps reshape and avoids auto re-routing that would add unwanted bends.
  // Halves share a fresh `formerParentId` so cleanup can merge them back later.
  // computeEdgeSplitPlan does the geometry; this only commits the transaction.
  splitEdgeAtHit(branch: DroppedBranch, hit: EdgeSplitHit): void {
    const parentEdge = hit.edge;
    if (!parentEdge.points || parentEdge.points.length < 2) return;

    const junctionId = mintJunctionId();
    const centre = hit.snapPoint;
    const plan = computeEdgeSplitPlan(
      parentEdge.points,
      hit.segmentIndex,
      hit.snapPoint,
      branch.otherEndWorld(),
    );

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
          targetPort: plan.halfASidePort,
          routingMode: 'manual',
          points: plan.firstHalf,
          data: { formerParentId, kind } satisfies SldLinkEdgeData,
        },
        {
          ...edgeShape(kind),
          id: mintLinkId(),
          source: junctionId,
          sourcePort: plan.halfBSidePort,
          target: parentEdge.target,
          targetPort: parentEdge.targetPort,
          targetPosition: parentEdge.target === '' ? parentEdge.targetPosition : undefined,
          routingMode: 'manual',
          points: plan.secondHalf,
          data: { formerParentId, kind } satisfies SldLinkEdgeData,
        },
      ]);
      branch.attachTo(junctionId, plan.branchSidePort);
    });
  }

  // Spawn a junction at the dangling endpoint and re-anchor both edges. No
  // `formerParentId` — there's no parent path to merge back to.
  mergeAtDanglingEndpoint(branch: DroppedBranch, existing: DanglingEndpoint): void {
    const junctionId = mintJunctionId();
    const centre = existing.position;
    const kind = branch.kind;

    const existingEdge = this.modelService.getEdgeById(existing.edgeId);
    const existingOtherEnd = existingEdge
      ? otherEndWorld(this.modelService, existingEdge, existing.side)
      : null;
    const existingPort: SldJunctionPortId = existingOtherEnd
      ? pickJunctionPortId(centre, existingOtherEnd)
      : SLD_JUNCTION_PORT_IDS.top;

    const branchOtherEnd = branch.otherEndWorld();
    const branchPort: SldJunctionPortId = branchOtherEnd
      ? pickJunctionPortId(centre, branchOtherEnd)
      : SLD_JUNCTION_PORT_IDS.top;

    const existingEdgePatch =
      existing.side === 'target'
        ? { target: junctionId, targetPort: existingPort, targetPosition: undefined }
        : { source: junctionId, sourcePort: existingPort, sourcePosition: undefined };

    this.ngDiagramService.transaction(() => {
      this.modelService.addNodes([junctionNodeAt(centre, junctionId, kind)]);
      this.modelService.updateEdge(existing.edgeId, existingEdgePatch);
      branch.attachTo(junctionId, branchPort);
    });
  }
}
