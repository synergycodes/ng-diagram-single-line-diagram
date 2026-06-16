import type { MinimapNodeStyle, MinimapNodeStyleFn, Node } from 'ng-diagram';
import { isJunctionNode, isSymbolNode, isWireNode } from '../geometry/node-types';
import type { SymbolRegistryService } from '../../../symbols/symbol-registry.service';

// ng-diagram bridge: maps each SLD node type to the dot/shape the minimap draws
// for it, so the overview reads at a glance — junctions as brand dots, wires
// faint, symbols coloured by voltage tier. Returns null to fall back to the
// minimap default.
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
      // Tint by voltage tier (`--c-volt-*`); unknown/untiered symbols fall back to neutral text colour.
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
