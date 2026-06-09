// Type-prefixed ids (`sld-link-…`, `sld-junction-…`) so a model dump
// reveals the kind of object at a glance — ng-diagram is type-blind at the id level.

const LINK_ID_PREFIX = 'sld-link-';
const JUNCTION_ID_PREFIX = 'sld-junction-';

export function mintLinkId(): string {
  return `${LINK_ID_PREFIX}${crypto.randomUUID()}`;
}

export function mintJunctionId(): string {
  return `${JUNCTION_ID_PREFIX}${crypto.randomUUID()}`;
}

// Lives inside `edge.data`, not as an id field — unprefixed.
export function mintFormerParentId(): string {
  return crypto.randomUUID();
}
