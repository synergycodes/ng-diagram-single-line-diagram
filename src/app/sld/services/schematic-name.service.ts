import { Injectable, computed, signal } from '@angular/core';
import { INITIAL_SCHEMATIC_NAME } from '../diagram/model/initial-model';

// Fallback once the user clears the field; the app starts on the seeded bay's name.
const DEFAULT_NAME = 'Untitled SLD';

/** Holds the name of the schematic being built. Shared by the navbar (rename)
 *  and the SVG export (filename). Root-scoped — the two live in different DI
 *  scopes (page vs. diagram). */
@Injectable({ providedIn: 'root' })
export class SchematicNameService {
  readonly name = signal<string>(INITIAL_SCHEMATIC_NAME);

  /** Filesystem-safe base name for the exported SVG (no extension). */
  readonly fileName = computed(() => toSafeFileName(this.name()));

  /** Commit an edited name; blank input falls back to the default. */
  rename(value: string): void {
    const trimmed = value.trim();
    this.name.set(trimmed.length > 0 ? trimmed : DEFAULT_NAME);
  }
}

// Keeps filename-safe chars (alphanumeric, space, _ . ( ) -); collapses whitespace.
function toSafeFileName(name: string): string {
  const safe = name
    .replace(/[^a-zA-Z0-9 _.()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return safe.length > 0 ? safe : 'sld';
}
