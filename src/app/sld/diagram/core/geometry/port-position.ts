import type { Edge, NgDiagramModelService, Node as NgDiagramNode, Point } from 'ng-diagram';

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

// World position of an edge endpoint, by node id. Connected ends resolve to the
// node's bbox centre (a good-enough approximation for classifying port
// direction); a loose/dangling end ('' id) falls back to the given position.
export function endpointWorldPosition(
  modelService: NgDiagramModelService,
  nodeId: string,
  position: Point | undefined,
): Point | null {
  if (nodeId === '') return position ?? null;
  const node = modelService.getNodeById(nodeId);
  if (!node) return null;
  const size = node.size ?? { width: 0, height: 0 };
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}

// World position of an edge's OTHER end, relative to the named side. Used to
// bias which junction port a re-anchored end should take.
export function otherEndWorld(
  modelService: NgDiagramModelService,
  edge: Edge,
  side: 'source' | 'target',
): Point | null {
  return side === 'target'
    ? endpointWorldPosition(modelService, edge.source, edge.sourcePosition)
    : endpointWorldPosition(modelService, edge.target, edge.targetPosition);
}
