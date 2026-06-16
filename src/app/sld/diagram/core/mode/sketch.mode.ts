import type { DiagramModeStrategy } from './diagram-mode.strategy';

/**
 * Sketch mode — drag wires and symbols; connections are inferred geometrically
 * (no ports, no native edges). Wires are a palette item here, ports stay hidden,
 * and native linking is disabled (there's nothing to link to).
 */
export const SKETCH_MODE: DiagramModeStrategy = {
  id: 'sketch',
  label: 'Sketch',
  description: 'Drag wires + symbols, connections derived geometrically',
  showsPorts: false,
  allowsConnections: false,
  showsDanglingDropZones: false,
  showsWiresInPalette: true,
};
