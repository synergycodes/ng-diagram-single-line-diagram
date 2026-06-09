import type { Terminal } from '../../symbols/types';
import { terminalBboxPct, terminalEffectiveSide } from './symbol-geometry';

function term(partial: Partial<Terminal>): Terminal {
  return { id: 't', side: 'top', xPct: 0, yPct: 0, ...partial };
}

describe('terminalBboxPct', () => {
  it('returns the same percentages at orientation 0', () => {
    const t = term({ side: 'right', xPct: 100, yPct: 50 });
    const r = terminalBboxPct(t, { width: 80, height: 40 }, 0);
    expect(r.xPct).toBeCloseTo(100);
    expect(r.yPct).toBeCloseTo(50);
  });

  it('handles 180° as a point reflection', () => {
    // top-centre terminal flips to bottom-centre after 180°.
    const t = term({ side: 'top', xPct: 50, yPct: 0 });
    const r = terminalBboxPct(t, { width: 80, height: 40 }, 180);
    expect(r.xPct).toBeCloseTo(50);
    expect(r.yPct).toBeCloseTo(100);
  });

  it('maps a top-centre terminal onto the right edge at 90°', () => {
    // For 90°/270° the bbox dimensions are width↔height swapped relative to
    // the symbol's natural frame. A terminal at the TOP of the natural frame
    // ends up on the RIGHT edge of the rotated bbox.
    const t = term({ side: 'top', xPct: 50, yPct: 0 });
    // Symbol natural frame is 40×80, so bbox after 90° is 80×40.
    const r = terminalBboxPct(t, { width: 80, height: 40 }, 90);
    expect(r.xPct).toBeCloseTo(100); // right edge of the 80-wide bbox
    expect(r.yPct).toBeCloseTo(50); // vertically centred
  });

  it('maps a top-centre terminal onto the left edge at 270°', () => {
    const t = term({ side: 'top', xPct: 50, yPct: 0 });
    const r = terminalBboxPct(t, { width: 80, height: 40 }, 270);
    expect(r.xPct).toBeCloseTo(0);
    expect(r.yPct).toBeCloseTo(50);
  });

  it('is consistent with terminalEffectiveSide for cardinal terminals', () => {
    // For each base side at 0°/90°/180°/270° the percent position lands on
    // the matching effective edge (xPct/yPct ∈ {0, 50, 100}).
    const cases = [
      { terminal: term({ side: 'top', xPct: 50, yPct: 0 }) },
      { terminal: term({ side: 'right', xPct: 100, yPct: 50 }) },
      { terminal: term({ side: 'bottom', xPct: 50, yPct: 100 }) },
      { terminal: term({ side: 'left', xPct: 0, yPct: 50 }) },
    ];
    const orientations = [0, 90, 180, 270] as const;
    for (const c of cases) {
      for (const o of orientations) {
        const swap = o === 90 || o === 270;
        const bbox = swap ? { width: 40, height: 80 } : { width: 80, height: 40 };
        const pos = terminalBboxPct(c.terminal, bbox, o);
        const side = terminalEffectiveSide(c.terminal.side, o);
        if (side === 'top') expect(pos.yPct).toBeCloseTo(0);
        if (side === 'bottom') expect(pos.yPct).toBeCloseTo(100);
        if (side === 'left') expect(pos.xPct).toBeCloseTo(0);
        if (side === 'right') expect(pos.xPct).toBeCloseTo(100);
      }
    }
  });
});
