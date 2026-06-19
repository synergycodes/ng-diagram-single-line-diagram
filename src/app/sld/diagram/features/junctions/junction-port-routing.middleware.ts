import type {
  Edge,
  EdgeRouting,
  EdgeRoutingConfig,
  EdgeRoutingManager,
  Middleware,
  Point,
} from 'ng-diagram';
import {
  junctionCentre,
  SLD_JUNCTION_NODE_TYPE,
  SLD_LINK_NOSTUB_ROUTING,
} from '../../core/geometry/node-types';
import { collectBranchesByJunction, reassignJunctionBranches } from './graph/junction-routing';

// Middleware on the model-update pipeline: when junction-touching edges/nodes
// change, reassign junction-side ports (so branches don't leave collinear) and
// route junction-incident auto edges stub-less (no exit nub off the dot).
// Idempotent — no patches on a clean state, safe to re-run every tick.
export function createJunctionPortRoutingMiddleware(): Middleware<'sld-junction-port-routing'> {
  return {
    name: 'sld-junction-port-routing',
    execute(context, next) {
      const { state, nodesMap, helpers, edgeRoutingManager } = context;

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

      // Register the stub-less variant lazily — only needed once a junction exists.
      ensureNoStubRoutingRegistered(edgeRoutingManager);

      const junctionIds = new Set(junctions.map((j) => j.id));
      const branchesByJunction = collectBranchesByJunction(
        junctionIds,
        state.edges,
        (nodeId, pos) => otherEndCentre(nodesMap, nodeId, pos),
      );

      // One patch per edge so a port change and the routing flag merge into one update.
      const patches = new Map<string, Partial<Edge> & { id: Edge['id'] }>();
      const patch = (id: string, change: Partial<Edge>): void => {
        patches.set(id, { ...(patches.get(id) ?? { id }), ...change });
      };

      for (const junction of junctions) {
        const branches = branchesByJunction.get(junction.id);
        if (!branches || branches.length === 0) continue;

        const centre = junctionCentre(junction.position);
        for (const change of reassignJunctionBranches(centre, branches)) {
          patch(
            change.edgeId,
            change.side === 'target' ? { targetPort: change.port } : { sourcePort: change.port },
          );
        }
      }

      // Junction-incident auto edges route stub-less; ones relinked off a
      // junction fall back to orthogonal. Manual edges ignore the routing name.
      for (const edge of state.edges) {
        if (edge.routingMode === 'manual') continue;
        const touchesJunction = junctionIds.has(edge.source) || junctionIds.has(edge.target);
        if (touchesJunction) {
          if (edge.routing !== SLD_LINK_NOSTUB_ROUTING) {
            patch(edge.id, { routing: SLD_LINK_NOSTUB_ROUTING });
          }
        } else if (edge.routing === SLD_LINK_NOSTUB_ROUTING) {
          patch(edge.id, { routing: 'orthogonal' });
        }
      }

      if (patches.size > 0) {
        next({ edgesToUpdate: Array.from(patches.values()) });
      } else {
        next();
      }
    },
  };
}

// Thin orthogonal variant with the end stub forced to 0, delegating the rest to
// the built-in router. No-op once registered / if the built-in is missing.
function ensureNoStubRoutingRegistered(manager: EdgeRoutingManager): void {
  if (manager.hasRouting(SLD_LINK_NOSTUB_ROUTING)) return;
  const orthogonal = manager.getRouting('orthogonal');
  if (!orthogonal) return;
  const noStub: EdgeRouting = {
    name: SLD_LINK_NOSTUB_ROUTING,
    computePoints: (ctx, cfg) => orthogonal.computePoints(ctx, withoutEndStub(cfg)),
    computeSvgPath: (points, cfg) => orthogonal.computeSvgPath(points, cfg),
    // Optional on the interface — delegate only when the built-in provides them.
    computePointOnPath: orthogonal.computePointOnPath?.bind(orthogonal),
    computePointAtDistance: orthogonal.computePointAtDistance?.bind(orthogonal),
  };
  manager.registerRouting(noStub);
}

function withoutEndStub(cfg?: EdgeRoutingConfig): EdgeRoutingConfig {
  return {
    ...(cfg ?? { defaultRouting: 'orthogonal' }),
    orthogonal: { ...cfg?.orthogonal, firstLastSegmentLength: 0 },
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
