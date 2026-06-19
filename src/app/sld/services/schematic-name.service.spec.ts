import { SchematicNameService } from './schematic-name.service';

describe('SchematicNameService', () => {
  let service: SchematicNameService;

  beforeEach(() => {
    service = new SchematicNameService();
  });

  it('defaults to "Untitled SLD"', () => {
    expect(service.name()).toBe('Untitled SLD');
  });

  it('trims and keeps a non-empty name', () => {
    service.rename('  Bay 7  ');
    expect(service.name()).toBe('Bay 7');
  });

  it('falls back to the default when renamed to blank', () => {
    service.rename('   ');
    expect(service.name()).toBe('Untitled SLD');
  });

  it('derives a filesystem-safe export name', () => {
    service.rename('Bay 7: A/B?');
    expect(service.fileName()).toBe('Bay 7 AB');
  });

  it('falls back to "sld" when the name has no safe characters', () => {
    service.rename('///');
    // rename keeps the raw value (non-blank), but the export name sanitizes it.
    expect(service.fileName()).toBe('sld');
  });
});
