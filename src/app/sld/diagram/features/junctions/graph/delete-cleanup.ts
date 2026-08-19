import type {
  Edge,
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
//
// A deleted junction's wires are cascade-deleted with it, so demotion re-adds
// them from the event snapshot, anchored at the junction centre. The model is
// read through getModel() — the nodes()/edges() signals lag this event.
export function applyDeleteCleanup(deps: DeleteCleanupDeps, event: SelectionRemovedEvent): void {
  const deletedNodeIds = new Set(event.deletedNodes.map((node) => node.id));
  const junctionAnchors = new Map<string, Point>();
  for (const node of event.deletedNodes) {
    if (node.type !== SLD_JUNCTION_NODE_TYPE) continue;
    junctionAnchors.set(node.id, junctionCentre(node.position));
  }

  // A wire removed by the cascade survives as a dangling end — unless the user
  // deleted it explicitly (selected) or its far end went down in the same
  // delete (then the whole wire is gone for good).
  const demoted: Edge[] = [];
  for (const edge of event.deletedEdges) {
    if (edge.selected) continue;
    const sourceAnchor = junctionAnchors.get(edge.source);
    const targetAnchor = junctionAnchors.get(edge.target);
    if (!sourceAnchor && !targetAnchor) continue;
    const otherEnd = sourceAnchor ? edge.target : edge.source;
    if (otherEnd !== '' && deletedNodeIds.has(otherEnd)) continue;
    demoted.push({
      ...edge,
      selected: false,
      ...(sourceAnchor ? { source: '', sourcePort: undefined, sourcePosition: sourceAnchor } : {}),
      ...(targetAnchor ? { target: '', targetPort: undefined, targetPosition: targetAnchor } : {}),
    });
  }

  void runCleanup(deps, demoted);
}

async function runCleanup(deps: DeleteCleanupDeps, demoted: readonly Edge[]): Promise<void> {
  const { modelService, ngDiagramService } = deps;

  if (demoted.length > 0) {
    await modelService.addEdges([...demoted]);
  }

  // Reconcile every surviving junction whose branch count may have shifted:
  // drop 0-leg orphans and collapse any 2-branch passthrough back into one
  // edge — a delete shouldn't leave a "junction node with no dot" visible.
  for (const node of modelService.getModel().getNodes()) {
    if (node.type !== SLD_JUNCTION_NODE_TYPE) continue;
    reconcileJunction(modelService, ngDiagramService, node.id);
  }
}
