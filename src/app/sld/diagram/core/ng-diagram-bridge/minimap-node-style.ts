import type { MinimapNodeStyle, MinimapNodeStyleFn, Node } from 'ng-diagram';
import { isJunctionNode, isSymbolNode } from '../geometry/node-types';
import type { SymbolRegistryService } from '../../../symbols/symbol-registry.service';

// ng-diagram minimap-node-style bridge. Returns null to fall back to the minimap default.
export function buildMinimapNodeStyle(registry: SymbolRegistryService): MinimapNodeStyleFn {
  return (node: Node): MinimapNodeStyle | null => {
    if (isJunctionNode(node)) {
      return {
        shape: 'circle',
        fill: 'var(--c-brand-500)',
        stroke: 'var(--c-brand-700)',
        strokeWidth: 1,
      };
    }
    if (isSymbolNode(node)) {
      const symbol = registry.getById(node.data.symbolId);
      const tier = symbol?.voltageTier;
      const fill = tier ? `var(--c-volt-${tier})` : 'var(--c-text-3)';
      return {
        fill,
        stroke: node.selected ? 'var(--c-brand-500)' : 'transparent',
        strokeWidth: node.selected ? 1.5 : 0,
      };
    }
    return null;
  };
}
