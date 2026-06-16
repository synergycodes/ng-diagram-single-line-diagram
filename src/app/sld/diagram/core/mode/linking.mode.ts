import type { DiagramModeStrategy } from './diagram-mode.strategy';

/**
 * Linking mode — native ng-diagram ports and edges. Connections are explicit:
 * the user draws an edge from one port to another. Wires aren't a palette item
 * here (edges replace them), and dangling edge ends get drop indicators.
 */
export const LINKING_MODE: DiagramModeStrategy = {
  id: 'linking',
  label: 'Linking',
  description: 'Native ng-diagram ports and edges',
  showsPorts: true,
  allowsConnections: true,
  showsDanglingDropZones: true,
  showsWiresInPalette: false,
};
