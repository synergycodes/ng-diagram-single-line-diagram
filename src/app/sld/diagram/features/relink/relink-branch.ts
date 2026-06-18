import { NgDiagramModelService, type Edge, type Point } from 'ng-diagram';
import type { DroppedBranch } from '../junctions';
import { otherEndWorld } from '../../core/geometry/port-position';
import type { LinkKind } from '../../core/geometry/node-types';

// DroppedBranch for relinking one end of an EXISTING edge: committing updates
// that edge's dragged side in place rather than creating a new edge.
// JunctionAttachmentService resolves the target the same way as for a fresh draw.
export class RelinkBranch implements DroppedBranch {
  constructor(
    private readonly modelService: NgDiagramModelService,
    readonly kind: LinkKind,
    private readonly edgeId: string,
    private readonly side: 'source' | 'target',
  ) {}

  otherEndWorld(): Point | null {
    const edge = this.modelService.getEdgeById(this.edgeId);
    return edge ? otherEndWorld(this.modelService, edge, this.side) : null;
  }

  attachTo(nodeId: string, port: string): void {
    const patch: Partial<Edge> =
      this.side === 'target'
        ? { target: nodeId, targetPort: port, targetPosition: undefined }
        : { source: nodeId, sourcePort: port, sourcePosition: undefined };
    this.modelService.updateEdge(this.edgeId, patch);
  }

  leaveDangling(dropPosition: Point): void {
    const patch: Partial<Edge> =
      this.side === 'target'
        ? { target: '', targetPort: undefined, targetPosition: dropPosition, routingMode: 'auto' }
        : { source: '', sourcePort: undefined, sourcePosition: dropPosition, routingMode: 'auto' };
    this.modelService.updateEdge(this.edgeId, patch);
  }
}
