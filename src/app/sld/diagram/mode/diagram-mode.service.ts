import { Injectable, computed, signal } from '@angular/core';
import type { LinkKind } from '../../symbols/types';

// Each mode keeps its own model state; see DiagramStateStorageService.
export type DiagramMode = 'sketch' | 'linking';

@Injectable({ providedIn: 'root' })
export class DiagramModeService {
  private readonly _mode = signal<DiagramMode>('linking');
  private readonly _relinkGestureActive = signal(false);
  private readonly _relinkSourceKind = signal<LinkKind | null>(null);

  readonly mode = this._mode.asReadonly();
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
