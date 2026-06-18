import { Injectable, computed, inject } from '@angular/core';
import { NgDiagramModelService, type Point } from 'ng-diagram';
import { SymbolRegistryService } from '../../../symbols/symbol-registry.service';
import { computeJunctionPoints } from './graph/junction-detection';

// Reactive wrapper over computeJunctionPoints — never stored, always recomputed
// from the current model so it can't drift. Must be provided on a component
// with provideNgDiagram() in scope.
@Injectable()
export class JunctionsService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);

  readonly junctions = computed<readonly Point[]>(() => {
    const nodes = this.modelService.nodes();
    const edges = this.modelService.edges();
    return computeJunctionPoints(nodes, edges, (id) => this.registry.getById(id));
  });
}
