import type { Edge } from 'ng-diagram';
import { DxfLwPolyline } from '../dxf/dxf-entity';
import type { DxfEdgeRenderer, DxfRenderContext } from '../dxf/dxf-types';
import { LAYERS, LINE_WEIGHT } from './sld-dxf-constants';

/**
 * Emits a single LWPOLYLINE per link from `edge.points` — the routed polyline
 * ng-diagram exposes after routing (orthogonal, with or without junction
 * stubs), the same array svg-export.renderEdge draws.
 *
 * Power and control links are split by layer rather than dash: control's
 * on-screen dash is a rendering style with no DXF equivalent unless a custom
 * linetype is added to the vendored skeleton, so a dedicated layer is how the
 * kind survives into CAD. Dispatch is by `edge.type` (control links carry
 * SLD_CONTROL_LINK_EDGE_TYPE; power links leave `type` undefined and fall to
 * the default renderer).
 */
export const renderPowerLink: DxfEdgeRenderer = (ctx, edge) => renderLink(ctx, edge, LAYERS.LINKS);

export const renderControlLink: DxfEdgeRenderer = (ctx, edge) =>
  renderLink(ctx, edge, LAYERS.LINKS_CONTROL);

function renderLink(ctx: DxfRenderContext, edge: Edge, layer: string): void {
  const points = edge.points ?? [];
  if (points.length < 2) return;
  const mapped = points.map((point) => ctx.mapper.mapPoint(point.x, point.y));
  ctx.doc.addEntity(new DxfLwPolyline(layer, mapped, false, undefined, LINE_WEIGHT.LINK));
}
