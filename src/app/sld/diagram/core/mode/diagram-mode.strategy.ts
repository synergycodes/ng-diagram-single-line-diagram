import type { DiagramMode } from './diagram-mode.service';

/**
 * The complete per-mode behaviour profile. The two modes ('sketch' / 'linking')
 * differ in many small ways scattered across templates, services and styles;
 * collecting those differences into one strategy object per mode keeps the rest
 * of the app reading semantic flags (`current().showsPorts`) instead of
 * branching on `isLinking()` everywhere. To tweak or add a mode, edit (or add)
 * one strategy file — consumers don't change.
 *
 * See `sketch.mode.ts` and `linking.mode.ts` for the concrete profiles.
 */
export interface DiagramModeStrategy {
  /** The mode this strategy describes. */
  readonly id: DiagramMode;
  /** Human-readable name (shown in the mode toggle). */
  readonly label: string;
  /** One-line description of how connections work in this mode. */
  readonly description: string;
  /** Symbol ports are rendered and available for native linking. */
  readonly showsPorts: boolean;
  /** Native port-to-port linking (drawing edges) is allowed. */
  readonly allowsConnections: boolean;
  /** Drop indicators for dangling edge ends are shown during a gesture. */
  readonly showsDanglingDropZones: boolean;
  /** The "Wires" category appears in the symbol palette. */
  readonly showsWiresInPalette: boolean;
}
