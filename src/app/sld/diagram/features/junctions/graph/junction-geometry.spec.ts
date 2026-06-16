import type { Point } from 'ng-diagram';
import {
  SLD_JUNCTION_PORT_IDS,
  SLD_JUNCTION_SIZE_PX,
  type SldJunctionPortId,
} from '../../../core/geometry/node-types';
import {
  defaultHalfFallback,
  junctionPortWorld,
  pickBranchPortAvoidingHalves,
} from './junction-geometry';

describe('junction-geometry', () => {
  const centre: Point = { x: 100, y: 50 };
  const none = new Set<SldJunctionPortId>();

  describe('pickBranchPortAvoidingHalves', () => {
    it('faces the branch other-end direction when it is known', () => {
      expect(pickBranchPortAvoidingHalves('horizontal', centre, { x: 100, y: 200 }, none)).toBe(
        SLD_JUNCTION_PORT_IDS.bottom,
      );
      expect(pickBranchPortAvoidingHalves('horizontal', centre, { x: 100, y: -10 }, none)).toBe(
        SLD_JUNCTION_PORT_IDS.top,
      );
    });

    // Covers the defensive defaultBranchFallback path: branchOtherEnd is null
    // only for a degenerate edge with no resolvable far end.
    it('falls back to a default perpendicular port when the other end is null', () => {
      expect(pickBranchPortAvoidingHalves('horizontal', centre, null, none)).toBe(
        SLD_JUNCTION_PORT_IDS.bottom,
      );
      expect(pickBranchPortAvoidingHalves('vertical', centre, null, none)).toBe(
        SLD_JUNCTION_PORT_IDS.right,
      );
    });

    it('takes the opposite port when the preferred one is taken by a half', () => {
      const taken = new Set<SldJunctionPortId>([SLD_JUNCTION_PORT_IDS.bottom]);
      expect(pickBranchPortAvoidingHalves('horizontal', centre, null, taken)).toBe(
        SLD_JUNCTION_PORT_IDS.top,
      );
    });

    it('scans the remaining ports when preferred and opposite are both taken', () => {
      const taken = new Set<SldJunctionPortId>([
        SLD_JUNCTION_PORT_IDS.bottom,
        SLD_JUNCTION_PORT_IDS.top,
      ]);
      expect(pickBranchPortAvoidingHalves('horizontal', centre, null, taken)).toBe(
        SLD_JUNCTION_PORT_IDS.right,
      );
    });
  });

  describe('defaultHalfFallback', () => {
    it('splits a horizontal seam to left/right', () => {
      expect(defaultHalfFallback('horizontal', 'a')).toBe(SLD_JUNCTION_PORT_IDS.left);
      expect(defaultHalfFallback('horizontal', 'b')).toBe(SLD_JUNCTION_PORT_IDS.right);
    });

    it('splits a vertical seam to top/bottom', () => {
      expect(defaultHalfFallback('vertical', 'a')).toBe(SLD_JUNCTION_PORT_IDS.top);
      expect(defaultHalfFallback('vertical', 'b')).toBe(SLD_JUNCTION_PORT_IDS.bottom);
    });
  });

  describe('junctionPortWorld', () => {
    it('offsets the centre by half the junction size along the port axis', () => {
      const half = SLD_JUNCTION_SIZE_PX / 2;
      expect(junctionPortWorld(centre, SLD_JUNCTION_PORT_IDS.right)).toEqual({
        x: centre.x + half,
        y: centre.y,
      });
      expect(junctionPortWorld(centre, SLD_JUNCTION_PORT_IDS.top)).toEqual({
        x: centre.x,
        y: centre.y - half,
      });
    });
  });
});
