import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/simulate';
import { DocBuilder, isDoc } from './doc';
import { EXAMPLES } from './examples';
import { buildNetlist, netAt } from './netlist';
import { netPoint, probeNets, toggleProbe } from './probes';
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

describe('probes', () => {
  it('toggles a net on and off from any point on it', () => {
    const { doc } = divider();
    const nl = buildNetlist(doc);
    const names = () => probeNets(doc, nl).map((n) => nl.nets[n].name);
    toggleProbe(doc, nl, { x: 12, y: 8 });
    toggleProbe(doc, nl, { x: 4, y: 5 }); // along a wire
    expect(names()).toEqual(['N1', 'Vdd']);
    toggleProbe(doc, nl, { x: 12, y: 3 }); // Vdd again, through the other label
    expect(names()).toEqual(['N1']);
    toggleProbe(doc, nl, { x: 30, y: 30 }); // nothing there
    expect(doc.probes).toHaveLength(1);
  });

  it('plots each net once and never ground or a detached point', () => {
    const { doc } = divider();
    const nl = buildNetlist(doc);
    doc.probes = [{ x: 12, y: 2 }, { x: 12, y: 12 }, { x: 4, y: 4 }, { x: 30, y: 30 }];
    expect(probeNets(doc, nl).map((n) => nl.nets[n].name)).toEqual(['Vdd']);
    const n1 = netAt(nl, doc.wires, { x: 12, y: 8 })!;
    expect(netAt(nl, doc.wires, netPoint(nl, n1)!)).toBe(n1);
  });

  it('adds an empty probe list to documents saved before probes', () => {
    const { doc } = divider();
    const old = JSON.parse(JSON.stringify(doc));
    delete old.probes;
    expect(isDoc(old)).toBe(true);
    expect(old.probes).toEqual([]);
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

  const swing = (s: ArrayLike<number>) => Math.max(...Array.from(s)) - Math.min(...Array.from(s));

  it('bypassing Re multiplies the CE gain and holds the emitter still', () => {
    const degenerated = swing(run('ce-amp').v('Vc')) / 1; // 1 V p-p in
    const { v } = run('ce-bypass');
    const vc = v('Vc');
    expect(degenerated).toBeGreaterThan(3.5);
    expect(degenerated).toBeLessThan(5);
    expect(swing(vc) / 0.02).toBeGreaterThan(150); // 20 mV p-p in, gain ~ Rc/re
    expect(swing(v('Ve'))).toBeLessThan(0.01);
    // exponential Ic(Vbe): the collector swings further down than up
    expect(vc[0] - Math.min(...vc)).toBeGreaterThan(Math.max(...vc) - vc[0] + 0.2);
  });

  it('common base: the emitter barely moves and the output follows Vin in phase', () => {
    const { v } = run('cb');
    expect(swing(v('Ve'))).toBeLessThan(0.03); // vs 0.6 V p-p at Vin
    const gain = swing(v('Vout')) / 0.6;
    expect(gain).toBeGreaterThan(3.5); // ~ Rc / (Rs + re)
    expect(gain).toBeLessThan(4.7);
    expect(v('Vout')[125] - v('Vout')[0]).toBeGreaterThan(1); // t = 0.25 ms, input peak
  });

  it('emitter follower stays one nearly constant Vbe below its input', () => {
    const { v } = run('ef');
    const vin = v('Vin');
    const vout = v('Vout');
    for (let k = 0; k < vin.length; k += 10) {
      expect(vin[k] - vout[k]).toBeGreaterThan(0.6);
      expect(vin[k] - vout[k]).toBeLessThan(0.75);
    }
  });

  it('current mirror holds the load current until Q2 saturates', () => {
    const { v } = run('mirror');
    const sweep = v('Vsweep');
    const out = v('Vout');
    for (let k = 0; k < sweep.length; k += 10) {
      if (sweep[k] > 3) expect(sweep[k] - out[k]).toBeCloseTo(1.97, 1); // ≈ Iref·β/(β+2) × 2 kΩ
    }
    expect(sweep[600] - out[600]).toBeLessThan(1.2); // t = 1.5 ms, Vsweep = 1 V
  });

  it('non-inverting amplifier has a gain of 1 + Rf/Rg', () => {
    const { v } = run('noninverting');
    const vin = v('Vin');
    const vout = v('Vout');
    for (const k of [0, 250, 500, 900]) {
      expect(vout[k]).toBeCloseTo(3 * vin[k], 2);
      expect(v('V−')[k]).toBeCloseTo(vin[k], 3); // virtual short
    }
  });

  it('summing amplifier outputs minus the sum of its inputs', () => {
    const { v } = run('summing');
    const [a, b, out] = [v('Vin1'), v('Vin2'), v('Vout')];
    for (const k of [0, 200, 400, 700, 1500]) expect(out[k]).toBeCloseTo(-(a[k] + b[k]), 2);
  });

  it('integrator turns the square wave into a triangle', () => {
    const { v } = run('integrator');
    const vout = v('Vout');
    // Vin = +5 V from 0.5 ms to 1.5 ms: the output falls at Vin/(R1·C1) = 5 V/ms
    expect(vout[125]).toBeCloseTo(2.5, 1);
    expect(vout[250]).toBeCloseTo(0, 1);
    expect(vout[375]).toBeCloseTo(-2.5, 1);
    expect(vout[625]).toBeCloseTo(2.5, 1);
  });

  it('common source inverts with gain ~ gm·RD, squashed on the way up', () => {
    const { v } = run('cs-amp');
    const vout = v('Vout');
    const gain = swing(vout) / 0.4;
    expect(gain).toBeGreaterThan(8);
    expect(gain).toBeLessThan(12);
    expect(vout[125]).toBeLessThan(vout[0] - 1.5); // input peak pulls the drain down
    expect(vout[0] - vout[125]).toBeGreaterThan(vout[375] - vout[0] + 0.2);
  });

  it('source follower needs more Vgs at higher current', () => {
    const { v } = run('sf');
    const vgs = (k: number) => v('Vin')[k] - v('Vout')[k];
    expect(vgs(375)).toBeGreaterThan(1.2); // input trough
    expect(vgs(125) - vgs(375)).toBeGreaterThan(0.5); // input peak
    const gain = swing(v('Vout')) / 6;
    expect(gain).toBeGreaterThan(0.8);
    expect(gain).toBeLessThan(0.95);
  });

  it('common gate: the source moves with Vin far more than a BJT emitter does', () => {
    const { v } = run('cg');
    const frac = swing(v('Vs')) / 0.6;
    expect(frac).toBeGreaterThan(0.3); // Rin = 1/gm ‖ RS ≈ 670 Ω against Rsig = 1 kΩ
    expect(frac).toBeLessThan(0.5);
    const gain = swing(v('Vout')) / 0.6;
    expect(gain).toBeGreaterThan(3);
    expect(gain).toBeLessThan(5);
    expect(v('Vout')[125] - v('Vout')[0]).toBeGreaterThan(0.8);
  });

  it('cascode keeps M1’s drain nearly still while the output swings', () => {
    const { v } = run('cascode');
    expect(v('Vx')[0]).toBeCloseTo(2, 1);
    expect(swing(v('Vout'))).toBeGreaterThan(2.5);
    expect(swing(v('Vx')) / swing(v('Vout'))).toBeLessThan(0.15);
  });

  it('CMOS pair with mirror load amplifies the difference into one output', () => {
    const { v } = run('cmos-diff');
    const vout = v('Vout');
    expect(swing(vout) / 0.01).toBeGreaterThan(100);
    expect(vout[125] - vout[0]).toBeGreaterThan(0.5); // Vin+ peak raises the output
  });

  it('an emitter follower stops the load from eating the CE gain', () => {
    const { v } = run('two-stage');
    const loaded = swing(v('VoA'));
    const buffered = swing(v('VoB'));
    expect(loaded).toBeLessThan(1); // ≈ (Rc‖RL)/Re × 1 V p-p
    expect(buffered).toBeGreaterThan(3.5);
  });

  it('push-pull output stalls while neither transistor conducts', () => {
    const { v } = run('push-pull');
    const vin = v('Vin');
    const vout = v('Vout');
    for (let k = 0; k < vin.length; k++) {
      if (Math.abs(vin[k]) < 0.45) expect(Math.abs(vout[k])).toBeLessThan(0.01);
    }
    expect(vin[250] - vout[250]).toBeGreaterThan(0.6); // t = 0.5 ms, input peak
    expect(vin[250] - vout[250]).toBeLessThan(0.8);
  });
});
