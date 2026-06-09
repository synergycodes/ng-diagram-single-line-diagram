import { Injectable, computed, inject } from '@angular/core';
import { NgDiagramModelService, type Edge, type Node, type Point } from 'ng-diagram';
import { SymbolRegistryService } from '../../symbols/symbol-registry.service';
import type { LinkKind, SymbolDef } from '../../symbols/types';
import { POSITION_TOLERANCE_PX } from '../geometry/constants';
import {
  edgeKind,
  isJunctionNode,
  isSymbolNode,
  isWireNode,
  nodeWireSegment,
} from '../geometry/node-types';
import { samePoint, segmentAxis } from '../geometry/orthogonal';
import { pointBucketKey, SegmentIndex } from '../geometry/spatial-hash';
import {
  leadBodyEndWorld,
  leadIsHorizontalAfterRotation,
  terminalWorld,
} from '../geometry/symbol-geometry';

// Junctions are derived from world-space wire-continuation clusters (3+ ticks). Must be provided on a component with provideNgDiagram() in scope.
@Injectable()
export class ConnectivityService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly registry = inject(SymbolRegistryService);

  readonly junctions = computed<readonly Point[]>(() => {
    const nodes = this.modelService.nodes();
    const edges = this.modelService.edges();
    return computeJunctionPoints(nodes, edges, (id) => this.registry.getById(id));
  });
}

interface WireSegment {
  readonly id: string;
  readonly start: Point;
  readonly end: Point;
  readonly horizontal: boolean;
  readonly kind: LinkKind;
}

interface KindedPoint {
  readonly point: Point;
  readonly kind: LinkKind;
}

interface Cluster {
  readonly point: Point;
  readonly kind: LinkKind;
  count: number;
  readonly midSegments: Set<string>;
}

export function computeJunctionPoints(
  nodes: readonly Node[],
  edges: readonly Edge[],
  getSymbol: (id: string) => SymbolDef | undefined,
): Point[] {
  const segments: WireSegment[] = [];
  const points: KindedPoint[] = [];

  for (const node of nodes) {
    const size = node.size;
    if (!size) continue;
    if (isSymbolNode(node)) {
      const symbolNode = node;
      const def = getSymbol(symbolNode.data.symbolId);
      if (!def) continue;
      const orientation = symbolNode.data.orientation ?? 0;
      for (const terminalDef of def.terminals) {
        // Sketch-mode connectivity is power-only — control terminals
        // connect exclusively through linking-mode edges (dashed).
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
    } else if (isWireNode(node)) {
      const seg = nodeWireSegment(node);
      if (!seg) continue;
      segments.push({
        id: node.id,
        start: seg.start,
        end: seg.end,
        horizontal: seg.horizontal,
        kind: 'power',
      });
      points.push({ point: seg.start, kind: 'power' });
      points.push({ point: seg.end, kind: 'power' });
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
  // 4-tick cluster (they're topologically independent layers). Cluster points
  // by snapped bucket in O(N); coincidence relies on grid-aligned geometry.
  const clustersByKey = new Map<string, Cluster>();
  for (const { point, kind } of points) {
    const key = pointBucketKey(point, kind);
    const existing = clustersByKey.get(key);
    if (existing) existing.count += 1;
    else clustersByKey.set(key, { point, kind, count: 1, midSegments: new Set() });
  }

  // A segment passing through mid-cluster contributes 2 (one tick per half).
  // Index segments by row/column so each cluster only tests segments on its own
  // line instead of every segment. Only same-kind segments count.
  const segmentIndex = new SegmentIndex<WireSegment>();
  for (const segment of segments) segmentIndex.add(segment);

  for (const cluster of clustersByKey.values()) {
    for (const segment of segmentIndex.candidates(cluster.point)) {
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

function pointOnSegmentInterior(point: Point, segment: WireSegment): boolean {
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
