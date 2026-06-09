import type { Node, Point } from 'ng-diagram';
import { isSymbolNode, isWireNode, nodeWireSegment } from './node-types';
import { POSITION_TOLERANCE_PX } from './constants';
import { pointBucketKey, SegmentIndex } from './spatial-hash';
import { terminalWorld } from './symbol-geometry';
import type { SymbolDef } from '../../symbols/types';

// Lead mid-segment hits are intentionally NOT counted — a lead is the symbol's own
// outline, not an independent conductor (mirrors ConnectivityService.junctions()).
export function findConnectedNodeIds(
  startId: string,
  nodes: readonly Node[],
  getSymbol: (id: string) => SymbolDef | undefined,
): ReadonlySet<string> {
  const footprint = collectConnectionFootprint(nodes, getSymbol);
  if (!footprint.byId.has(startId)) return new Set();

  const adjacency = buildAdjacency(footprint);
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const neighbours = adjacency.get(current);
    if (!neighbours) continue;
    for (const next of neighbours) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

interface WireSegment {
  readonly start: Point;
  readonly end: Point;
  readonly horizontal: boolean;
}

interface IndexedWire extends WireSegment {
  readonly id: string;
}

interface ConnectionFootprint {
  readonly byId: Map<string, readonly Point[]>;
  readonly wireById: Map<string, WireSegment>;
}

function collectConnectionFootprint(
  nodes: readonly Node[],
  getSymbol: (id: string) => SymbolDef | undefined,
): ConnectionFootprint {
  const byId = new Map<string, readonly Point[]>();
  const wireById = new Map<string, WireSegment>();

  for (const node of nodes) {
    if (!node.size) continue;
    if (isSymbolNode(node)) {
      const def = getSymbol(node.data.symbolId);
      if (!def) continue;
      byId.set(
        node.id,
        def.terminals.map((terminal) => terminalWorld(node, node.size!, terminal)),
      );
    } else if (isWireNode(node)) {
      const seg = nodeWireSegment(node);
      if (!seg) continue;
      byId.set(node.id, [seg.start, seg.end]);
      wireById.set(node.id, { start: seg.start, end: seg.end, horizontal: seg.horizontal });
    }
  }

  return { byId, wireById };
}

// Adjacency over the geometric graph in roughly O(N): two nodes are connected if
// they share a connection point (same snapped bucket) or one node's point lies
// on another node's wire segment. Replaces the former O(N^2) all-pairs scan.
function buildAdjacency(footprint: ConnectionFootprint): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (a === b) return;
    let aSet = adjacency.get(a);
    if (!aSet) adjacency.set(a, (aSet = new Set()));
    aSet.add(b);
    let bSet = adjacency.get(b);
    if (!bSet) adjacency.set(b, (bSet = new Set()));
    bSet.add(a);
  };

  // Shared connection points: each node landing in a bucket connects to the
  // nodes already there.
  const pointBuckets = new Map<string, string[]>();
  for (const [id, points] of footprint.byId) {
    for (const point of points) {
      const key = pointBucketKey(point);
      const bucket = pointBuckets.get(key);
      if (bucket) {
        for (const other of bucket) connect(id, other);
        bucket.push(id);
      } else {
        pointBuckets.set(key, [id]);
      }
    }
  }

  // A point landing on a wire interior or endpoint connects to that wire. Both
  // directions are covered because every node's points are tested against the
  // wire index.
  const wireIndex = new SegmentIndex<IndexedWire>();
  for (const [id, segment] of footprint.wireById) wireIndex.add({ id, ...segment });
  for (const [id, points] of footprint.byId) {
    for (const point of points) {
      for (const wire of wireIndex.candidates(point)) {
        if (wire.id === id) continue;
        if (pointOnSegment(point, wire)) connect(id, wire.id);
      }
    }
  }

  return adjacency;
}

function pointOnSegment(point: Point, segment: WireSegment): boolean {
  if (segment.horizontal) {
    if (Math.abs(point.y - segment.start.y) > POSITION_TOLERANCE_PX) return false;
    const xMin = Math.min(segment.start.x, segment.end.x);
    const xMax = Math.max(segment.start.x, segment.end.x);
    return point.x >= xMin - POSITION_TOLERANCE_PX && point.x <= xMax + POSITION_TOLERANCE_PX;
  }
  if (Math.abs(point.x - segment.start.x) > POSITION_TOLERANCE_PX) return false;
  const yMin = Math.min(segment.start.y, segment.end.y);
  const yMax = Math.max(segment.start.y, segment.end.y);
  return point.y >= yMin - POSITION_TOLERANCE_PX && point.y <= yMax + POSITION_TOLERANCE_PX;
}
