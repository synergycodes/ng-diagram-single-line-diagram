import type { Middleware, Point } from 'ng-diagram';
import { findConnectedNodeIds } from '../geometry/connected-component';
import type { SymbolDef } from '../../symbols/types';

// Alt-drag carries the geometric connected component along. Group membership
// is cached at gesture start so fast drags can't desync the trailing group.
// `onActiveGroupChange` reports the moved set (anchors + group) for edge-stretch.
export function createDragGroupMiddleware(options: {
  getSymbol: (id: string) => SymbolDef | undefined;
  onActiveGroupChange?: (movedNodeIds: ReadonlySet<string>) => void;
}): Middleware<'sld-drag-group'> {
  const { getSymbol, onActiveGroupChange } = options;

  let cachedKey = '';
  let cachedGroup: ReadonlySet<string> = new Set<string>();

  return {
    name: 'sld-drag-group',
    execute(context, next) {
      const actionTypes = context.modelActionTypes;

      // Clear cache before early-bail so we observe the boundary regardless of modifier state on release.
      if (actionTypes.includes('moveNodesStop')) {
        cachedKey = '';
        cachedGroup = new Set();
        onActiveGroupChange?.(new Set());
        next();
        return;
      }

      const dragging = context.actionStateManager.dragging;
      if (!dragging || !dragging.modifiers.secondary) {
        next();
        return;
      }

      // Only fire on user drag actions — wire-snap's updateNode shares the same dragging state.
      const isMoveAction = actionTypes.some(
        (actionType) => actionType === 'moveNodes' || actionType === 'moveNodesBy',
      );
      if (!isMoveAction) {
        next();
        return;
      }

      const draggedIds = dragging.nodeIds;
      if (draggedIds.length === 0) {
        next();
        return;
      }

      const anchorId = draggedIds[0];
      const before = context.initialNodesMap.get(anchorId);
      const after = context.nodesMap.get(anchorId);
      if (!before || !after) {
        next();
        return;
      }
      const delta: Point = {
        x: after.position.x - before.position.x,
        y: after.position.y - before.position.y,
      };
      if (delta.x === 0 && delta.y === 0) {
        next();
        return;
      }

      // BFS on initialState.nodes so topology reflects what the user saw at grab time.
      const key = [...draggedIds].sort().join('|');
      if (key !== cachedKey) {
        const fresh = new Set<string>();
        for (const id of draggedIds) {
          for (const memberId of findConnectedNodeIds(id, context.initialState.nodes, getSymbol)) {
            fresh.add(memberId);
          }
        }
        for (const id of draggedIds) fresh.delete(id);
        cachedKey = key;
        cachedGroup = fresh;
      }

      if (cachedGroup.size === 0) {
        next();
        return;
      }

      const nodesToUpdate: { id: string; position: Point }[] = [];
      for (const id of cachedGroup) {
        const node = context.nodesMap.get(id);
        if (!node) continue;
        nodesToUpdate.push({
          id,
          position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
        });
      }

      // Anchors move via core, group members via this patch — report both.
      onActiveGroupChange?.(new Set([...draggedIds, ...cachedGroup]));
      next({ nodesToUpdate });
    },
  };
}
