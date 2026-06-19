import { type Edge, type Node, type Point } from 'ng-diagram';
import type { LinkKind, SymbolDef } from '../../../../symbols/types';
import { POSITION_TOLERANCE_PX } from '../../../core/geometry/constants';
import { edgeKind, isJunctionNode, isSymbolNode } from '../../../core/geometry/node-types';
import { samePoint, segmentAxis } from '../../../core/geometry/orthogonal';
import {
  leadBodyEndWorld,
  leadIsHorizontalAfterRotation,
  nodeOrientation,
  terminalWorld,
} from '../../../core/geometry/symbol-geometry';

// Junction-detection algorithm: derive junction dot positions from raw
// geometry. No DI, no model access — every input is passed in (see
// junctions.service.spec.ts for the covering tests).

// A straight orthogonal run (a symbol lead or one edge segment) used to detect
// ticks that pass *through* a cluster rather than ending at it.
interface RunSegment {
  readonly id: string;
  readonly start: Point;
  readonly end: Point;
  readonly horizontal: boolean;
  readonly kind: LinkKind;
}

// A single wire-end tick, tagged with its layer so power and control don't mix.
interface KindedPoint {
  readonly point: Point;
  readonly kind: LinkKind;
}

// Accumulator for one snapped location: how many continuations meet here and
// which mid-passing segments were already counted (so each is counted once).
interface Cluster {
  readonly point: Point;
  readonly kind: LinkKind;
  count: number;
  readonly midSegments: Set<string>;
}

// Derive junction dot positions from raw geometry: collect every continuation
// "tick" (a symbol terminal or an edge endpoint) plus mid-segment crossings,
// cluster coincident ticks, and keep clusters where 3+ continuations meet.
export function computeJunctionPoints(
  nodes: readonly Node[],
  edges: readonly Edge[],
  getSymbol: (id: string) => SymbolDef | undefined,
): Point[] {
  const segments: RunSegment[] = [];
  const points: KindedPoint[] = [];

  for (const node of nodes) {
    const size = node.size;
    if (!size) continue;
    if (isSymbolNode(node)) {
      const symbolNode = node;
      const def = getSymbol(symbolNode.data.symbolId);
      if (!def) continue;
      const orientation = nodeOrientation(symbolNode);
      for (const terminalDef of def.terminals) {
        // Control terminals contribute no geometric tick — control links are
        // dashed edges, and their endpoints already supply the cluster ticks.
        if (terminalDef.kind === 'control') continue;
        const terminal = terminalWorld(symbolNode, size, terminalDef);
        points.push({ point: terminal, kind: 'power' });
        // Lead is added as a segment only, never as a standalone point — the
        // body-edge endpoint isn't an independent connection.
        const leadEnd = leadBodyEndWorld(symbolNode, size, def, terminalDef);
        if (
          Math.abs(leadEnd.x - terminal.x) > POSITION_TOLERANCE_PX ||
          Math.abs(leadEnd.y - terminal.y) > POSITION_TOLERANCE_PX
        ) {
          segments.push({
            id: `${node.id}:${terminalDef.id}`,
            start: terminal,
            end: leadEnd,
            horizontal: leadIsHorizontalAfterRotation(terminalDef, orientation),
            kind: 'power',
          });
        }
      }
    }
    // Junction nodes contribute no independent points/segments — edge endpoints already provide the cluster ticks.
  }

  // Snap edge endpoints landing on a junction back to its centre so per-port
  // offsets don't stop them clustering. Carry the kind so power and control
  // crossings stay in separate clusters.
  const junctionCentres = new Map<string, { centre: Point; kind: LinkKind }>();
  for (const node of nodes) {
    if (isJunctionNode(node) && node.size) {
      junctionCentres.set(node.id, {
        centre: {
          x: node.position.x + node.size.width / 2,
          y: node.position.y + node.size.height / 2,
        },
        kind: node.data?.kind ?? 'power',
      });
    }
  }
  for (const edge of edges) {
    const edgePoints = edge.points;
    if (!edgePoints || edgePoints.length < 2) continue;
    const kind = edgeKind(edge);
    const sourceJunction = junctionCentres.get(edge.source);
    const targetJunction = junctionCentres.get(edge.target);
    points.push({ point: sourceJunction?.centre ?? edgePoints[0], kind });
    points.push({ point: targetJunction?.centre ?? edgePoints[edgePoints.length - 1], kind });
    for (let i = 0; i < edgePoints.length - 1; i++) {
      const segStart = edgePoints[i];
      const segEnd = edgePoints[i + 1];
      const axis = segmentAxis(segStart, segEnd);
      if (!axis) continue;
      segments.push({
        id: `${edge.id}:${i}`,
        start: segStart,
        end: segEnd,
        horizontal: axis === 'horizontal',
        kind,
      });
    }
  }

  // Partition by kind so a power link crossing a control link doesn't form a
  // 4-tick cluster (they're topologically independent layers). Coincident ticks
  // share a bucket key (rounded position per kind); relies on grid-aligned geometry.
  const clustersByKey = new Map<string, Cluster>();
  for (const { point, kind } of points) {
    const key = bucketKey(point, kind);
    const existing = clustersByKey.get(key);
    if (existing) existing.count += 1;
    else clustersByKey.set(key, { point, kind, count: 1, midSegments: new Set() });
  }

  // A segment passing through a cluster's mid-point contributes 2 (one tick per
  // half). Scan the segments directly — `pointOnSegmentInterior` rejects the
  // off-line ones and SLD diagrams are small. Only same-kind segments count.
  for (const cluster of clustersByKey.values()) {
    for (const segment of segments) {
      if (segment.kind !== cluster.kind) continue;
      if (cluster.midSegments.has(segment.id)) continue;
      if (samePoint(segment.start, cluster.point) || samePoint(segment.end, cluster.point))
        continue;
      if (pointOnSegmentInterior(cluster.point, segment)) {
        cluster.count += 2;
        cluster.midSegments.add(segment.id);
      }
    }
  }

  return [...clustersByKey.values()]
    .filter((cluster) => cluster.count >= 3)
    .map((cluster) => cluster.point);
}

// Groups coincident ticks: rounded world position, prefixed by kind so power
// and control never share a bucket.
function bucketKey(point: Point, kind: LinkKind): string {
  return `${kind}|${Math.round(point.x)}:${Math.round(point.y)}`;
}

// True when `point` lies strictly between a segment's endpoints (not at either
// end) — i.e. a wire runs straight through it, contributing two continuations.
function pointOnSegmentInterior(point: Point, segment: RunSegment): boolean {
  if (segment.horizontal) {
    if (Math.abs(point.y - segment.start.y) > POSITION_TOLERANCE_PX) return false;
    const xMin = Math.min(segment.start.x, segment.end.x);
    const xMax = Math.max(segment.start.x, segment.end.x);
    return point.x > xMin + POSITION_TOLERANCE_PX && point.x < xMax - POSITION_TOLERANCE_PX;
  }
  if (Math.abs(point.x - segment.start.x) > POSITION_TOLERANCE_PX) return false;
  const yMin = Math.min(segment.start.y, segment.end.y);
  const yMax = Math.max(segment.start.y, segment.end.y);
  return point.y > yMin + POSITION_TOLERANCE_PX && point.y < yMax - POSITION_TOLERANCE_PX;
}
