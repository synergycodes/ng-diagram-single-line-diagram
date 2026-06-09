import { mintFormerParentId, mintJunctionId, mintLinkId } from './id-factory';

describe('id-factory/mintLinkId', () => {
  it('returns a string with the `sld-link-` prefix', () => {
    const id = mintLinkId();
    expect(id.startsWith('sld-link-')).toBe(true);
  });

  it('produces different ids on consecutive calls', () => {
    expect(mintLinkId()).not.toBe(mintLinkId());
  });

  it('uses the UUID-after-prefix shape (~36 char uuid)', () => {
    const id = mintLinkId();
    // `sld-link-` is 9 chars; a v4 UUID is 36. Anything outside that
    // window means someone changed the underlying generator.
    expect(id.length).toBe(9 + 36);
  });
});

describe('id-factory/mintJunctionId', () => {
  it('returns a string with the `sld-junction-` prefix', () => {
    const id = mintJunctionId();
    expect(id.startsWith('sld-junction-')).toBe(true);
  });

  it('produces different ids on consecutive calls', () => {
    expect(mintJunctionId()).not.toBe(mintJunctionId());
  });
});

describe('id-factory/mintFormerParentId', () => {
  it('returns a bare UUID with no prefix', () => {
    // formerParentId lives in `edge.data`, not as a model-level id, so
    // it intentionally skips the type-prefix convention.
    const id = mintFormerParentId();
    expect(id.startsWith('sld-')).toBe(false);
    expect(id.length).toBe(36);
  });

  it('produces different ids on consecutive calls', () => {
    expect(mintFormerParentId()).not.toBe(mintFormerParentId());
  });
});
