import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/simulate';
import { DocBuilder } from './doc';
import { EXAMPLES } from './examples';
import { buildNetlist } from './netlist';
import { maxSegmentCurrent, segmentCurrents, wireCurrents } from './wireCurrents';

function solve(b: DocBuilder) {
  const nl = buildNetlist(b.doc);
  const sim = simulate(nl.sim, b.doc.sim);
  const wc = wireCurrents(b.doc, nl);
  const cur = segmentCurrents(wc, sim, 0);
  const at = (ax: number, ay: number, bx: number, by: number) => {
    const i = wc.segments.findIndex((s) => s.a.x === ax && s.a.y === ay && s.b.x === bx && s.b.y === by);
    expect(i).toBeGreaterThanOrEqual(0);
    return cur[i];
  };
  return { wc, sim, at };
}

describe('wire currents', () => {
  it('follows current through labels, with the sign along the wire', () => {
    const b = new DocBuilder();
    b.add('vsource', 4, 8, { wave: { type: 'dc', value: 6 } });
    b.add('label', 4, 4, { text: 'Vdd' });
    b.wire([4, 4], [4, 6]);
    b.add('ground', 4, 10);
    b.add('label', 12, 2, { text: 'Vdd' });
    b.wire([12, 2], [12, 4]);
    b.add('resistor', 12, 6, { params: { r: 2000 } });
    b.add('resistor', 12, 10, { params: { r: 1000 } });
    b.add('ground', 12, 12);
    const { at } = solve(b);
    expect(at(12, 2, 12, 4)).toBeCloseTo(2e-3, 9);
    expect(at(4, 4, 4, 6)).toBeCloseTo(-2e-3, 9);
  });

  it('splits a wire at a T-junction by KCL', () => {
    const b = new DocBuilder();
    b.add('vsource', 0, 4, { wave: { type: 'dc', value: 6 } });
    b.add('ground', 0, 6);
    b.wire([0, 2], [8, 2]);
    b.add('resistor', 4, 4, { params: { r: 1000 } });
    b.add('resistor', 8, 4, { params: { r: 2000 } });
    b.add('ground', 4, 6);
    b.add('ground', 8, 6);
    const { at } = solve(b);
    expect(at(0, 2, 4, 2)).toBeCloseTo(9e-3, 9);
    expect(at(4, 2, 8, 2)).toBeCloseTo(3e-3, 9);
  });

  it('shares current in a wire loop by length', () => {
    const b = new DocBuilder();
    b.add('vsource', 0, 4, { wave: { type: 'dc', value: 6 } });
    b.add('ground', 0, 6);
    b.add('resistor', 8, 4, { params: { r: 1000 } });
    b.add('ground', 8, 6);
    b.wire([0, 2], [8, 2]);
    b.wire([0, 2], [0, 0], [8, 0], [8, 2]);
    const { at } = solve(b);
    expect(at(0, 2, 8, 2)).toBeCloseTo(3.6e-3, 9);
    expect(at(0, 0, 8, 0)).toBeCloseTo(2.4e-3, 9);
  });

  it('gives every example a finite, non-zero scale', () => {
    for (const ex of EXAMPLES) {
      const doc = ex.build();
      const nl = buildNetlist(doc);
      const sim = simulate(nl.sim, doc.sim);
      const max = maxSegmentCurrent(wireCurrents(doc, nl), sim);
      expect(Number.isFinite(max) && max > 0, ex.id).toBe(true);
    }
  });
});
