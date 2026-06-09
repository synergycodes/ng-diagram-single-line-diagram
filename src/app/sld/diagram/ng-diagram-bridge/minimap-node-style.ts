import type { MinimapNodeStyle, MinimapNodeStyleFn, Node } from 'ng-diagram';
import { isJunctionNode, isSymbolNode, isWireNode } from '../geometry/node-types';
import type { SymbolRegistryService } from '../../symbols/symbol-registry.service';

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
    if (isWireNode(node)) {
      return {
        fill: 'var(--c-text-3)',
        opacity: 0.5,
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
