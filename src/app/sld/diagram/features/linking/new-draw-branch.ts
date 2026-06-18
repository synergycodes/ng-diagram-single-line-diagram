import { NgDiagramModelService, type Point } from 'ng-diagram';
import type { DroppedBranch } from '../junctions';
import { endpointWorldPosition } from '../../core/geometry/port-position';
import { edgeShape, type LinkKind, type SldLinkEdgeData } from '../../core/geometry/node-types';
import { mintLinkId } from '../../core/geometry/id-factory';

// DroppedBranch for a fresh port-to-port draw: committing the branch creates a
// NEW edge from the source port to wherever the draw resolved.
// JunctionAttachmentService just calls attachTo / leaveDangling.
export class NewDrawBranch implements DroppedBranch {
  constructor(
    private readonly modelService: NgDiagramModelService,
    readonly kind: LinkKind,
    private readonly sourceId: string,
    private readonly sourcePort: string,
  ) {}

  otherEndWorld(): Point | null {
    return endpointWorldPosition(this.modelService, this.sourceId, undefined);
  }

  attachTo(nodeId: string, port: string): void {
    this.modelService.addEdges([
      {
        ...edgeShape(this.kind),
        id: mintLinkId(),
        source: this.sourceId,
        sourcePort: this.sourcePort,
        target: nodeId,
        targetPort: port,
        data: { kind: this.kind } satisfies SldLinkEdgeData,
      },
    ]);
  }

  leaveDangling(dropPosition: Point): void {
    this.modelService.addEdges([
      {
        ...edgeShape(this.kind),
        id: mintLinkId(),
        source: this.sourceId,
        sourcePort: this.sourcePort,
        target: '',
        targetPosition: dropPosition,
        data: { kind: this.kind } satisfies SldLinkEdgeData,
      },
    ]);
  }
}
