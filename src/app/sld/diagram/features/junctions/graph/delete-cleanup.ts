import type {
  NgDiagramModelService,
  NgDiagramService,
  Point,
  SelectionRemovedEvent,
} from 'ng-diagram';
import { SLD_JUNCTION_NODE_TYPE, junctionCentre } from '../../../core/geometry/node-types';
import { reconcileJunction } from './junction-cleanup';

interface DeleteCleanupDeps {
  readonly modelService: NgDiagramModelService;
  readonly ngDiagramService: NgDiagramService;
}

// Post-delete junction maintenance, run on every selection-removed event:
// demote a deleted junction's edges to dangling, then reconcile survivors —
// drop empties and merge 2-branch passthroughs. Keeps the graph free of stale
// junctions left behind when a user deletes a node or edge.
export function applyDeleteCleanup(deps: DeleteCleanupDeps, event: SelectionRemovedEvent): void {
  const { modelService, ngDiagramService } = deps;

  const directlyDeleted: { id: string; position: Point }[] = [];
  for (const node of event.deletedNodes) {
    if (node.type !== SLD_JUNCTION_NODE_TYPE) continue;
    directlyDeleted.push({ id: node.id, position: node.position });
  }

  // Demote edges of user-deleted junctions to dangling.
  for (const { id, position } of directlyDeleted) {
    const anchor = junctionCentre(position);
    for (const edge of modelService.edges()) {
      if (edge.source === id) {
        modelService.updateEdge(edge.id, {
          source: '',
          sourcePort: undefined,
          sourcePosition: anchor,
        });
      } else if (edge.target === id) {
        modelService.updateEdge(edge.id, {
          target: '',
          targetPort: undefined,
          targetPosition: anchor,
        });
      }
    }
  }

  // Reconcile every surviving junction whose branch count may have shifted:
  // drop 0-leg orphans and collapse any 2-branch passthrough back into one
  // edge — a delete shouldn't leave a "junction node with no dot" visible.
  for (const node of modelService.nodes()) {
    if (node.type !== SLD_JUNCTION_NODE_TYPE) continue;
    reconcileJunction(modelService, ngDiagramService, node.id);
  }
}
