import type { Point } from 'ng-diagram';
import type { LinkKind } from '../../core/geometry/node-types';

/**
 * A link endpoint being dropped onto the canvas, abstracted so the junction
 * attachment ops don't care whether it's a brand-new port-to-port draw or an
 * existing edge being relinked.
 *
 * Each consumer feature (linking, relink) implements `DroppedBranch` its own way
 * and passes it to `JunctionAttachmentService`, which commits the branch via
 * these four members without needing to know which gesture produced it.
 */
export interface DroppedBranch {
  // power / control — gates same-kind matching and the new junction's kind.
  readonly kind: LinkKind;

  // World position of the branch's fixed far end (null when unresolvable), used
  // to bias which junction port the branch takes.
  otherEndWorld(): Point | null;

  // Commit the branch onto a resolved node + port (always a junction here).
  attachTo(nodeId: string, port: string): void;

  // Commit the branch as a loose end at the drop position (no node attached).
  leaveDangling(dropPosition: Point): void;
}
