import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/simulate';
import { DocBuilder, isDoc } from './doc';
import { EXAMPLES } from './examples';
import { buildNetlist, netAt } from './netlist';
import { layoutRuler, rulerAt } from './ruler';

function divider() {
  const b = new DocBuilder();
  b.add('vsource', 4, 8, { name: 'V1', wave: { type: 'dc', value: 6 } });
  b.add('label', 4, 4, { text: 'Vdd' });
  b.wire([4, 4], [4, 6]);
  b.add('ground', 4, 10);
  b.add('label', 12, 2, { text: 'Vdd' });
  b.wire([12, 2], [12, 4]);
  b.add('resistor', 12, 6, { name: 'R2', params: { r: 2000 } });
  b.add('resistor', 12, 10, { name: 'R1', params: { r: 1000 } });
  b.add('ground', 12, 12);
  const ruler = b.ruler(
    [
      [12, 2],
      [12, 8],
      [12, 12],
    ],
    17,
    2,
    10,
  );
  return { doc: b.doc, ruler };
}

describe('netlist', () => {
  it('joins nets through wires, touching pins and labels', () => {
    const { doc } = divider();
    const nl = buildNetlist(doc);
    expect(nl.nets.map((n) => n.name).sort()).toEqual(['GND', 'N1', 'Vdd']);
    expect(nl.sim.nodeCount).toBe(2);
    const vdd = netAt(nl, doc.wires, { x: 4, y: 5 });
    expect(nl.nets[vdd!].name).toBe('Vdd');
    expect(netAt(nl, doc.wires, { x: 12, y: 3 })).toBe(vdd);
    expect(netAt(nl, doc.wires, { x: 30, y: 30 })).toBeUndefined();
  });

  it('connects T-junctions and marks them with a dot', () => {
    const b = new DocBuilder();
    b.wire([0, 0], [10, 0]);
    b.wire([5, 0], [5, 5]);
    const nl = buildNetlist(b.doc);
    expect(new Set(nl.wireNets.values()).size).toBe(1);
    expect(nl.junctions).toEqual([{ x: 5, y: 0 }]);
  });

  it('warns when there is no ground', () => {
    const b = new DocBuilder();
    b.add('resistor', 0, 0);
    expect(buildNetlist(b.doc).warnings).toHaveLength(1);
  });
});

describe('ruler', () => {
  it('shows the divider like the sketch', () => {
    const { doc, ruler } = divider();
    const nl = buildNetlist(doc);
    const sim = simulate(nl.sim, doc.sim);
    const res = layoutRuler(ruler, doc, nl, sim);
    if (!res.ok) throw new Error(res.error);
    const { layout } = res;
    expect(layout.nodes.map((n) => n.name)).toEqual(['Vdd', 'N1', 'GND']);
    expect(layout.nodes.map((n) => n.role)).toEqual(['end', 'mid', 'end']);
    const at = rulerAt(layout, nl, sim, 0);
    expect(at.spans.map((s) => s.names)).toEqual([['R2'], ['R1']]);
    expect(at.spans.map((s) => s.dv)).toEqual([expect.closeTo(4, 6), expect.closeTo(2, 6)]);
    expect(at.spans.every((s) => s.lane === 0)).toBe(true);
  });

  it('follows the clicked order and only measures consecutive pairs', () => {
    const { doc, ruler } = divider();
    ruler.path = [
      { x: 12, y: 12 }, // GND
      { x: 4, y: 5 }, // Vdd, via the source's wire
    ];
    const nl = buildNetlist(doc);
    const sim = simulate(nl.sim, doc.sim);
    const res = layoutRuler(ruler, doc, nl, sim);
    if (!res.ok) throw new Error(res.error);
    const at = rulerAt(res.layout, nl, sim, 0);
    expect(res.layout.nodes.map((n) => n.name)).toEqual(['GND', 'Vdd']);
    expect(at.spans).toHaveLength(1);
    expect(at.spans[0].names).toEqual(['V1']);
    expect(at.spans[0].dv).toBeCloseTo(-6, 6);
  });

  it('names whatever component sits between each consecutive pair', () => {
    const { doc, ruler } = divider();
    ruler.path = [
      { x: 12, y: 2 },
      { x: 12, y: 12 },
    ];
    const nl = buildNetlist(doc);
    const res = layoutRuler(ruler, doc, nl, null);
    if (!res.ok) throw new Error(res.error);
    expect(res.layout.spans[0].names).toEqual(['V1']); // V1 is directly across Vdd–GND
    ruler.path = [
      { x: 12, y: 8 },
      { x: 4, y: 5 },
      { x: 12, y: 12 },
    ];
    const res2 = layoutRuler(ruler, doc, nl, null);
    if (!res2.ok) throw new Error(res2.error);
    expect(res2.layout.spans.map((s) => s.names)).toEqual([['R2'], ['V1']]);
  });

  it('scales every ruler to the whole circuit by default, even a floating path', () => {
    const { doc, ruler } = divider();
    ruler.path = [
      { x: 12, y: 2 }, // Vdd = 6 V
      { x: 12, y: 8 }, // N1 = 2 V
    ];
    const nl = buildNetlist(doc);
    const sim = simulate(nl.sim, doc.sim);
    const res = layoutRuler(ruler, doc, nl, sim);
    if (!res.ok) throw new Error(res.error);
    expect(res.layout.vmin).toBeCloseTo(0, 9); // GND is the circuit minimum
    expect(res.layout.vmax).toBeCloseTo(6, 6);
    expect(res.layout.path.min).toBeCloseTo(2, 6);
    expect(res.layout.path.max).toBeCloseTo(6, 6);

    ruler.scale = { min: 1.5, max: 2.5 };
    const custom = layoutRuler(ruler, doc, nl, sim);
    if (!custom.ok) throw new Error(custom.error);
    expect([custom.layout.vmin, custom.layout.vmax]).toEqual([1.5, 2.5]);
  });

  it('rejects repeated and detached nodes', () => {
    const { doc, ruler } = divider();
    const nl = buildNetlist(doc);
    ruler.path = [
      { x: 12, y: 2 },
      { x: 4, y: 5 },
    ];
    expect(layoutRuler(ruler, doc, nl, null).ok).toBe(false);
    ruler.path = [
      { x: 12, y: 2 },
      { x: 50, y: 50 },
    ];
    expect(layoutRuler(ruler, doc, nl, null).ok).toBe(false);
  });

  it('upgrades rulers saved in the old top/bottom format', () => {
    const { doc } = divider();
    const old = JSON.parse(JSON.stringify(doc));
    old.rulers = [{ id: 'r', name: 'R', top: { x: 12, y: 2 }, bottom: { x: 12, y: 12 }, hidden: [], x: 0, y: 0, height: 5, pinnedTime: null }];
    expect(isDoc(old)).toBe(true);
    expect(old.rulers[0].path).toEqual([
      { x: 12, y: 2 },
      { x: 12, y: 12 },
    ]);
    expect(old.rulers[0].top).toBeUndefined();
  });
});

describe('examples', () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s simulates and lays out its rulers', (_id, ex) => {
    const doc = ex.build();
    const nl = buildNetlist(doc);
    expect(nl.warnings).toEqual([]);
    const sim = simulate(nl.sim, doc.sim);
    expect(sim.error).toBeUndefined();
    expect(sim.times.length).toBe(doc.sim.steps + 1);
    for (const r of doc.rulers) {
      const res = layoutRuler(r, doc, nl, sim);
      if (!res.ok) throw new Error(`${r.name}: ${res.error}`);
      expect(res.layout.nodes.length).toBeGreaterThanOrEqual(2);
      expect(res.layout.spans.length).toBeGreaterThan(0);
    }
  });

  it('CE amp sits at a sensible bias point', () => {
    const doc = EXAMPLES.find((e) => e.id === 'ce-amp')!.build();
    const nl = buildNetlist(doc);
    const sim = simulate(nl.sim, doc.sim);
    const vc = nl.nets.find((n) => n.name === 'Vc')!;
    const v0 = sim.nodeV[vc.node][0];
    expect(v0).toBeGreaterThan(3);
    expect(v0).toBeLessThan(9);
    const swing = Math.max(...sim.nodeV[vc.node]) - Math.min(...sim.nodeV[vc.node]);
    expect(swing).toBeGreaterThan(3); // ~ 2 × 0.5 V × 4.7
  });

  it('RLC overshoots', () => {
    const doc = EXAMPLES.find((e) => e.id === 'rlc')!.build();
    const nl = buildNetlist(doc);
    const sim = simulate(nl.sim, doc.sim);
    const vc = nl.nets.find((n) => n.name === 'Vc')!;
    expect(Math.max(...sim.nodeV[vc.node])).toBeGreaterThan(6);
  });

  const run = (id: string) => {
    const doc = EXAMPLES.find((e) => e.id === id)!.build();
    const nl = buildNetlist(doc);
    const sim = simulate(nl.sim, doc.sim);
    const v = (name: string) => {
      const net = nl.nets.find((n) => n.name === name)!;
      return net.node < 0 ? new Float64Array(sim.times.length) : sim.nodeV[net.node];
    };
    return { sim, v };
  };

  it('differential pair splits the tail current and amplifies the difference', () => {
    const { v } = run('diff-pair');
    const vo1 = v('Vo1');
    const vo2 = v('Vo2');
    // Balanced at t = 0: ~0.5 mA per side through 10 kΩ → ~7 V
    expect(vo1[0]).toBeGreaterThan(6);
    expect(vo1[0]).toBeLessThan(8);
    expect(vo1[0]).toBeCloseTo(vo2[0], 2);
    expect(v('Vtail')[0]).toBeCloseTo(-0.65, 1);
    // ±10 mV in → roughly ±1.5…2 V differential out, outputs moving in opposite directions
    const diff = vo1.map((a, i) => a - vo2[i]);
    expect(Math.max(...diff)).toBeGreaterThan(1.2);
    expect(Math.min(...diff)).toBeLessThan(-1.2);
    expect((vo1[125] - vo1[0]) * (vo2[125] - vo2[0])).toBeLessThan(0); // t = 0.25 ms, input peak
  });

  it('current sense output is 20× the floating shunt drop', () => {
    const { sim, v } = run('shunt');
    const bus = v('Vbus');
    const load = v('Vload');
    const sense = v('Vsense');
    for (const k of [0, 500, 700, sim.times.length - 1]) {
      const drop = bus[k] - load[k];
      expect(drop).toBeGreaterThan(0.04);
      expect(drop).toBeLessThan(0.16);
      expect(sense[k]).toBeCloseTo(20 * drop, 2);
    }
    // the drop follows the pulsed load: ~0.05 V with the sink off, ~0.15 V with it on
    expect(bus[0] - load[0]).toBeCloseTo(0.05, 2);
    expect(bus[500] - load[500]).toBeCloseTo(0.15, 2); // t = 2.5 ms, sink fully on
  });
});
