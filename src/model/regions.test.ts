import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/simulate';
import { DocBuilder } from './doc';
import { EXAMPLES } from './examples';
import { buildNetlist } from './netlist';
import { bjtRegion, mosRegion, transistorRegion } from './regions';
import type { Doc } from './types';

describe('region rules', () => {
  it('classifies BJTs by junction bias', () => {
    expect(bjtRegion(0.65, -3, false).short).toBe('active');
    expect(bjtRegion(0.75, 0.6, false).short).toBe('saturation');
    expect(bjtRegion(0.1, -5, false).short).toBe('cutoff');
    expect(bjtRegion(-2, 0.6, false).short).toBe('reverse');
  });

  it('classifies MOSFETs by overdrive and drain voltage', () => {
    expect(mosRegion(0.5, 3, 1, false).short).toBe('cutoff');
    expect(mosRegion(3, 0.5, 1, false).short).toBe('triode'); // vds < vov = 2
    expect(mosRegion(3, 4, 1, false).short).toBe('saturation');
    // Reversed: vds = −0.5 → measured from the drain, vgd = 3.5, still triode
    const r = mosRegion(3, -0.5, 1, false);
    expect(r.short).toBe('triode');
    expect(r.why).toMatch(/swapped/);
  });

  it('gives BJT active and MOSFET saturation the same role', () => {
    expect(bjtRegion(0.65, -3, false).role).toBe(mosRegion(3, 4, 1, false).role);
    expect(bjtRegion(0.75, 0.6, false).role).toBe(mosRegion(3, 0.5, 1, false).role);
  });
});

function regionsOf(doc: Doc, k = 0) {
  const nl = buildNetlist(doc);
  const sim = simulate(nl.sim, doc.sim);
  const at = (i: number) =>
    Object.fromEntries(
      doc.components
        .map((c) => [c.name, transistorRegion(c, nl, sim, i)?.short] as const)
        .filter(([, r]) => r !== undefined),
    );
  return { at, sim, first: at(k) };
}

describe('regions in circuits', () => {
  const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.build();

  it('CE amplifier and differential pair stay in forward active', () => {
    const ce = regionsOf(example('ce-amp'));
    for (const k of [0, 300, 900, 1500]) expect(ce.at(k).Q1).toBe('active');
    const diff = regionsOf(example('diff-pair'));
    expect(diff.first).toEqual({ Q1: 'active', Q2: 'active' });
  });

  it('the single-stage examples keep their transistors in the amplifying region', () => {
    for (const id of ['ce-bypass', 'cb', 'ef', 'two-stage', 'cs-amp', 'sf', 'cg', 'cascode', 'cmos-diff']) {
      const r = regionsOf(example(id));
      for (const k of [0, 125, 375, 700, 1500]) {
        for (const [name, region] of Object.entries(r.at(k))) {
          expect(region, `${id} ${name} at ${k}`).toBe(name.startsWith('M') ? 'saturation' : 'active');
        }
      }
    }
  });

  it('the mirror saturates Q2 at the dip, and push-pull turns both off at a crossing', () => {
    const mirror = regionsOf(example('mirror'));
    expect(mirror.first).toEqual({ Q1: 'active', Q2: 'active' });
    expect(mirror.at(600).Q2).toBe('saturation');
    const pp = regionsOf(example('push-pull'));
    expect(pp.first).toEqual({ Q1: 'cutoff', Q2: 'cutoff' });
    expect(pp.at(250)).toEqual({ Q1: 'active', Q2: 'cutoff' });
  });

  it('a hard-driven NPN switch saturates, and turns off with no base drive', () => {
    const b = new DocBuilder();
    b.add('vsource', 0, 4, {
      name: 'V1',
      wave: { type: 'pulse', v1: 5, v2: 0, delay: 1e-3, rise: 0, fall: 0, width: 1e-3, period: 0 },
    });
    b.add('ground', 0, 6);
    b.wire([0, 2], [4, 2], [4, 4]);
    b.add('resistor', 4, 6, { name: 'Rb', params: { r: 1000 } });
    b.wire([4, 8], [6, 8]);
    b.add('npn', 8, 8, { name: 'Q1' });
    b.add('resistor', 8, 4, { name: 'Rc', params: { r: 1000 } });
    b.wire([4, 2], [8, 2]);
    b.add('ground', 8, 10);
    b.doc.sim = { stopTime: 2e-3, steps: 200, start: 'dc', method: 'trap' };
    const r = regionsOf(b.doc);
    expect(r.at(50).Q1).toBe('saturation'); // input high
    expect(r.at(150).Q1).toBe('cutoff'); // input low
  });

  it('CMOS inverter: one device off, the other in triode, both saturated mid-swing', () => {
    const r = regionsOf(example('cmos'));
    // t = 0: input low → NMOS off, PMOS pulls the output fully up (no drop → triode)
    expect(r.first).toEqual({ M2: 'triode', M1: 'cutoff' });
    // t = 1 ms: input high → the roles swap
    expect(r.at(400)).toEqual({ M2: 'cutoff', M1: 'triode' });
    // somewhere on the input ramp both conduct and at least one is in saturation
    const ramp = Array.from({ length: 120 }, (_, i) => r.at(100 + i));
    expect(ramp.some((x) => x.M1 === 'saturation' && x.M2 !== 'cutoff')).toBe(true);
  });
});
