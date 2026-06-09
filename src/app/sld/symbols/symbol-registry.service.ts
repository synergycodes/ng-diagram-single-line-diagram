import { Injectable, computed, signal } from '@angular/core';
import { SYMBOL_REGISTRY as BUILT_IN_SYMBOLS } from './symbol-registry.generated';
import type { SymbolDef } from './types';

@Injectable({ providedIn: 'root' })
export class SymbolRegistryService {
  private readonly _symbols = signal<readonly SymbolDef[]>(BUILT_IN_SYMBOLS);

  readonly symbols = this._symbols.asReadonly();

  private readonly byId = computed(
    () => new Map(this._symbols().map((symbol) => [symbol.id, symbol])),
  );

  getById(id: string): SymbolDef | undefined {
    return this.byId().get(id);
  }

  register(def: SymbolDef): void {
    this._symbols.update((list) => {
      if (list.some((symbol) => symbol.id === def.id)) {
        throw new Error(`Symbol "${def.id}" is already registered`);
      }
      return [...list, def];
    });
  }

  unregister(id: string): void {
    this._symbols.update((list) => list.filter((symbol) => symbol.id !== id));
  }
}
