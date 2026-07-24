import type { Node, Point } from 'ng-diagram';
import { junctionCentre } from '../../core/geometry/node-types';
import { DxfLwPolyline } from '../dxf/dxf-entity';
import type { DxfNodeRenderer, DxfRenderContext } from '../dxf/dxf-types';
import { ELLIPSE_SEGMENTS, JUNCTION_RADIUS, LAYERS, LINE_WEIGHT } from './sld-dxf-constants';

/**
 * Renders an SLD `sld-junction` node as a small closed circle at the junction
 * centre — the DXF stand-in for the filled connection dot drawn by
 * `renderJunctionDot` in svg-markup.ts. The vendored DXF library has no filled
 * primitive, so the dot is a closed LWPOLYLINE outline (standard CAD practice
 * for a connection node).
 */
export const renderJunctionNode: DxfNodeRenderer = (ctx, node) => {
  const centre = junctionCentre((node as Node).position);
  const points: Point[] = [];
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / ELLIPSE_SEGMENTS;
    points.push({
      x: centre.x + JUNCTION_RADIUS * Math.cos(angle),
      y: centre.y + JUNCTION_RADIUS * Math.sin(angle),
    });
  }
  emitClosedCircle(ctx, points);
};

function emitClosedCircle(ctx: DxfRenderContext, worldPoints: readonly Point[]): void {
  const mapped = worldPoints.map((point) => ctx.mapper.mapPoint(point.x, point.y));
  ctx.doc.addEntity(
    new DxfLwPolyline(LAYERS.JUNCTIONS, mapped, true, undefined, LINE_WEIGHT.JUNCTION),
  );
}
