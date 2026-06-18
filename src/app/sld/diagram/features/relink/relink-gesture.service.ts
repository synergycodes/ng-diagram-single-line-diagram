import { Injectable, signal } from '@angular/core';
import type { LinkKind } from '../../core/geometry/node-types';

// Shared state of an in-flight relink drag. The relink overlay sets it; the
// canvas and the link-drop preview read it to reveal ports and colour the
// gesture. Native port-to-port linking has its own state in
// NgDiagramActionsAdapter — this covers the relink gesture, which is driven
// from the overlay rather than ng-diagram's linking action.
@Injectable()
export class RelinkGestureService {
  private readonly _active = signal(false);
  private readonly _sourceKind = signal<LinkKind | null>(null);

  readonly active = this._active.asReadonly();
  readonly sourceKind = this._sourceKind.asReadonly();

  setActive(active: boolean): void {
    this._active.set(active);
    if (!active) this._sourceKind.set(null);
  }

  setSourceKind(kind: LinkKind | null): void {
    this._sourceKind.set(kind);
  }
}
