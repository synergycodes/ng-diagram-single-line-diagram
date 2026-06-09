import type { Node as NgDiagramNode, Point } from 'ng-diagram';

// Mirrors ng-diagram's internal `getPortPosition` for side-anchored ports.
// Returns `null` when node/port/measurement isn't available.
export function portWorldPosition(node: NgDiagramNode | null, portId: string): Point | null {
  if (!node?.measuredPorts) return null;
  const port = node.measuredPorts.find((measured) => measured.id === portId);
  if (!port?.position || !port?.size) return null;
  const left = node.position.x + port.position.x;
  const top = node.position.y + port.position.y;
  switch (port.side) {
    case 'left':
      return { x: left, y: top + port.size.height / 2 };
    case 'right':
      return { x: left + port.size.width, y: top + port.size.height / 2 };
    case 'top':
      return { x: left + port.size.width / 2, y: top };
    case 'bottom':
      return { x: left + port.size.width / 2, y: top + port.size.height };
    default:
      return { x: left, y: top };
  }
}
