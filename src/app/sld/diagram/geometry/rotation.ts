import type { Node } from 'ng-diagram';
import { isSymbolNode, type SldSymbolNodeData, type SymbolOrientation } from './node-types';

// Bypasses ng-diagram's `node.angle` (which would hide the resize adornment):
// orientation lives in `data`, size is swapped, the CSS transform is in
// `SldSymbolNodeComponent`. Returns `null` when the node has no size yet.
export function rotateSymbolPatch(
  node: Node,
): { size: { width: number; height: number }; data: SldSymbolNodeData } | null {
  if (!isSymbolNode(node)) return null;
  if (!node.size) return null;
  const data = node.data;
  const nextOrientation = (((data.orientation ?? 0) + 90) % 360) as SymbolOrientation;
  return {
    size: { width: node.size.height, height: node.size.width },
    data: { ...data, orientation: nextOrientation },
  };
}
