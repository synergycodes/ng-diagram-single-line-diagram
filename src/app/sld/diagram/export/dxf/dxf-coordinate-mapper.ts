/**
 * Converts diagram pixel coordinates to DXF millimeter coordinates.
 *
 * - Applies a fixed px→mm scale, so device geometry stays at a constant
 *   physical size regardless of overall diagram size (no paper fitting).
 * - Adds a padding margin around the diagram, in mm.
 * - Flips the Y axis: screen Y grows downward, DXF Y grows upward.
 */
export class CoordinateMapper {
  private constructor(
    private readonly scale: number,
    private readonly offsetX: number,
    private readonly offsetY: number,
    private readonly totalHeightMm: number,
    private readonly boundsX: number,
    private readonly boundsY: number,
  ) {}

  static fromScale(
    bounds: { x: number; y: number; width: number; height: number },
    scaleMmPerPx: number,
    paddingPx: number,
  ): CoordinateMapper {
    const paddingMm = paddingPx * scaleMmPerPx;
    const totalHeightMm = bounds.height * scaleMmPerPx + 2 * paddingMm;
    return new CoordinateMapper(
      scaleMmPerPx,
      paddingMm,
      paddingMm,
      totalHeightMm,
      bounds.x,
      bounds.y,
    );
  }

  mapPoint(px: number, py: number): { x: number; y: number } {
    const x = this.offsetX + (px - this.boundsX) * this.scale;
    const y = this.totalHeightMm - (this.offsetY + (py - this.boundsY) * this.scale);
    return { x, y };
  }

  mapLength(px: number): number {
    return Math.abs(px * this.scale);
  }
}
