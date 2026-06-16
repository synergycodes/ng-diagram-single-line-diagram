import type { Edge, Middleware, Point } from 'ng-diagram';
import { junctionCentre, SLD_JUNCTION_NODE_TYPE } from '../geometry/node-types';
import { collectBranchesByJunction, reassignJunctionBranches } from '../geometry/junction-routing';

// Middleware on the model-update pipeline: after edges/nodes around a junction
// change, reassign the junction-side ports so branches don't leave the junction
// collinear (visible overlap on the first segment). Idempotent — no patches on
// a clean state, so it can re-run every tick without thrashing.
export function createJunctionPortRoutingMiddleware(): Middleware<'sld-junction-port-routing'> {
  return {
    name: 'sld-junction-port-routing',
    execute(context, next) {
      const { state, nodesMap, helpers } = context;

      // Skip when nothing junction-touching changed.
      const relevant =
        helpers.anyEdgesAdded() ||
        helpers.anyNodesAdded() ||
        helpers.getAffectedEdgeIds(['source', 'target', 'sourcePort', 'targetPort']).length > 0 ||
        helpers.getAffectedNodeIds(['position', 'angle', 'size']).length > 0;
      if (!relevant) {
        next();
        return;
      }

      const junctions = state.nodes.filter((n) => n.type === SLD_JUNCTION_NODE_TYPE);
      if (junctions.length === 0) {
        next();
        return;
      }

      const junctionIds = new Set(junctions.map((j) => j.id));
      const branchesByJunction = collectBranchesByJunction(
        junctionIds,
        state.edges,
        (nodeId, pos) => otherEndCentre(nodesMap, nodeId, pos),
      );

      const edgesToUpdate: (Partial<Edge> & { id: Edge['id'] })[] = [];

      for (const junction of junctions) {
        const branches = branchesByJunction.get(junction.id);
        if (!branches || branches.length === 0) continue;

        const centre = junctionCentre(junction.position);
        const changes = reassignJunctionBranches(centre, branches);
        for (const change of changes) {
          edgesToUpdate.push(
            change.side === 'target'
              ? { id: change.edgeId, targetPort: change.port }
              : { id: change.edgeId, sourcePort: change.port },
          );
        }
      }

      if (edgesToUpdate.length > 0) {
        next({ edgesToUpdate });
      } else {
        next();
      }
    },
  };
}

// Centre point of the branch's far end, used to pick which junction side it
// leaves from. The far end is either another node (use its centre) or a
// dangling endpoint with no node (use its raw position).
function otherEndCentre(
  nodesMap: ReadonlyMap<string, { position: Point; size?: { width: number; height: number } }>,
  otherNodeId: string,
  otherPosition: Point | undefined,
): Point | null {
  // Empty id == dangling end (not yet connected to a node).
  if (otherNodeId === '') return otherPosition ?? null;
  const node = nodesMap.get(otherNodeId);
  if (!node) return null;
  const size = node.size ?? { width: 0, height: 0 };
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}
