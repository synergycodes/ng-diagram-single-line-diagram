import { Injectable, computed, signal } from '@angular/core';
import type { LinkKind } from '../../../symbols/types';
import type { DiagramModeStrategy } from './diagram-mode.strategy';
import { LINKING_MODE } from './linking.mode';
import { SKETCH_MODE } from './sketch.mode';

// Each mode keeps its own model state; see DiagramStateStorageService.
export type DiagramMode = 'sketch' | 'linking';

// Per-mode behaviour profiles. The only place that maps a mode id to its config.
const STRATEGIES: Record<DiagramMode, DiagramModeStrategy> = {
  linking: LINKING_MODE,
  sketch: SKETCH_MODE,
};

// Modes in toggle order — the mode-toggle UI builds itself from this, so labels
// and descriptions live only in the strategy files.
export const DIAGRAM_MODES: readonly DiagramModeStrategy[] = [LINKING_MODE, SKETCH_MODE];

// Owns the active diagram mode and exposes its behaviour profile as signals.
// The two modes are deliberately separate connection paradigms: 'linking' uses
// native ng-diagram ports/edges, 'sketch' infers connections geometrically from
// dragged wires/symbols. They can't share a model, so each keeps its own state
// (DiagramStateStorageService) and its own behaviour flags (the strategies).
@Injectable({ providedIn: 'root' })
export class DiagramModeService {
  private readonly _mode = signal<DiagramMode>('linking');
  private readonly _relinkGestureActive = signal(false);
  private readonly _relinkSourceKind = signal<LinkKind | null>(null);

  readonly mode = this._mode.asReadonly();
  // The active mode's behaviour profile — consumers read semantic flags off
  // this (e.g. `current().showsPorts`) instead of branching on the mode id.
  readonly current = computed<DiagramModeStrategy>(() => STRATEGIES[this._mode()]);
  readonly isLinking = computed(() => this._mode() === 'linking');
  readonly isSketch = computed(() => this._mode() === 'sketch');
  // OR-ed with ng-diagram's native linking state to drive `.is-linking-gesture`
  // so symbol ports reveal during a relink drag as they do during native linking.
  readonly relinkGestureActive = this._relinkGestureActive.asReadonly();
  // Kind of the edge being relinked; null when no relink in flight.
  readonly relinkSourceKind = this._relinkSourceKind.asReadonly();

  setMode(mode: DiagramMode): void {
    this._mode.set(mode);
  }

  toggle(): void {
    this._mode.update((current) => (current === 'linking' ? 'sketch' : 'linking'));
  }

  setRelinkGestureActive(active: boolean): void {
    this._relinkGestureActive.set(active);
    if (!active) this._relinkSourceKind.set(null);
  }

  setRelinkSourceKind(kind: LinkKind | null): void {
    this._relinkSourceKind.set(kind);
  }
}
