import { describe, expect, it } from 'vitest';
import { ElementSpec } from './devices';
import { simulate, SimSettings } from './simulate';
import { Waveform } from './waveforms';

const dc = (value: number): Waveform => ({ type: 'dc', value });
const settings = (over: Partial<SimSettings> = {}): SimSettings => ({
  stopTime: 1e-3,
  steps: 10,
  start: 'dc',
  method: 'trap',
  ...over,
});
const last = (a: Float64Array) => a[a.length - 1];
const run = (nodeCount: number, elements: ElementSpec[], s: Partial<SimSettings> = {}) => {
  const r = simulate({ nodeCount, elements }, settings(s));
  expect(r.error).toBeUndefined();
  return r;
};

describe('linear circuits', () => {
  it('solves a voltage divider', () => {
    // node0 = vdd, node1 = mid
    const r = run(2, [
      { kind: 'V', id: 'V1', nodes: [0, -1], wave: dc(10) },
      { kind: 'R', id: 'R2', nodes: [0, 1], r: 2000 },
      { kind: 'R', id: 'R1', nodes: [1, -1], r: 1000 },
    ]);
    expect(r.nodeV[1][0]).toBeCloseTo(10 / 3, 6);
    const [iIn, iOut] = r.pinI.get('R2')!;
    expect(iIn[0]).toBeCloseTo(10 / 3000, 9);
    expect(iOut[0]).toBeCloseTo(-10 / 3000, 9);
    // Source delivers power: current enters its + pin from the circuit as negative.
    expect(r.pinI.get('V1')![0][0]).toBeCloseTo(-10 / 3000, 9);
  });

  it('charges an RC from zero initial conditions', () => {
    const r = run(
      2,
      [
        { kind: 'V', id: 'V1', nodes: [0, -1], wave: dc(5) },
        { kind: 'R', id: 'R1', nodes: [0, 1], r: 1000 },
        { kind: 'C', id: 'C1', nodes: [1, -1], c: 1e-6, ic: 0 },
      ],
      { start: 'zero', stopTime: 5e-3, steps: 1000 },
    );
    expect(r.nodeV[1][0]).toBeCloseTo(0, 3);
    const k = 200; // t = 1 ms = τ
    expect(r.times[k]).toBeCloseTo(1e-3, 12);
    expect(r.nodeV[1][k]).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
    // Capacitor current = (5 − v)/R
    expect(r.pinI.get('C1')![0][k]).toBeCloseTo((5 - r.nodeV[1][k]) / 1000, 5);
  });

  it('charges an RC driven by a step source from the DC operating point', () => {
    const r = run(
      2,
      [
        { kind: 'V', id: 'V1', nodes: [0, -1], wave: { type: 'step', v1: 0, v2: 5, delay: 1e-3, rise: 0 } },
        { kind: 'R', id: 'R1', nodes: [0, 1], r: 1000 },
        { kind: 'C', id: 'C1', nodes: [1, -1], c: 1e-6, ic: 0 },
      ],
      { stopTime: 6e-3, steps: 1200 },
    );
    expect(r.nodeV[1][100]).toBeCloseTo(0, 6);
    expect(last(r.nodeV[1])).toBeCloseTo(5 * (1 - Math.exp(-5)), 2);
  });

  it('rings an LC tank at the right frequency', () => {
    const L = 1e-3;
    const C = 1e-6;
    const period = 2 * Math.PI * Math.sqrt(L * C);
    const r = run(
      1,
      [
        { kind: 'C', id: 'C1', nodes: [0, -1], c: C, ic: 1 },
        { kind: 'L', id: 'L1', nodes: [0, -1], l: L, ic: 0 },
      ],
      { start: 'zero', stopTime: period, steps: 2000 },
    );
    expect(r.nodeV[0][0]).toBeCloseTo(1, 3);
    expect(r.nodeV[0][1000]).toBeCloseTo(-1, 2);
    expect(r.nodeV[0][2000]).toBeCloseTo(1, 2);
  });

  it('drives a current source into a resistor', () => {
    const r = run(1, [
      { kind: 'I', id: 'I1', nodes: [0, -1], wave: dc(1e-3) },
      { kind: 'R', id: 'R1', nodes: [0, -1], r: 1000 },
    ]);
    expect(r.nodeV[0][0]).toBeCloseTo(1, 6);
  });

  it('reports a voltage-source loop', () => {
    const r = simulate(
      {
        nodeCount: 1,
        elements: [
          { kind: 'V', id: 'V1', nodes: [0, -1], wave: dc(1) },
          { kind: 'V', id: 'V2', nodes: [0, -1], wave: dc(2) },
        ],
      },
      settings(),
    );
    expect(r.error).toMatch(/loop/);
  });
});

describe('nonlinear circuits', () => {
  it('biases a diode', () => {
    const r = run(2, [
      { kind: 'V', id: 'V1', nodes: [0, -1], wave: dc(5) },
      { kind: 'R', id: 'R1', nodes: [0, 1], r: 1000 },
      { kind: 'D', id: 'D1', nodes: [1, -1], is: 1e-14, n: 1 },
    ]);
    const vd = r.nodeV[1][0];
    expect(vd).toBeGreaterThan(0.6);
    expect(vd).toBeLessThan(0.75);
    const id = r.pinI.get('D1')![0][0];
    expect(id).toBeCloseTo((5 - vd) / 1000, 6);
  });

  it('half-wave rectifies a sine', () => {
    const r = run(
      2,
      [
        { kind: 'V', id: 'V1', nodes: [0, -1], wave: { type: 'sine', offset: 0, amplitude: 10, freq: 50, delay: 0, phase: 0 } },
        { kind: 'D', id: 'D1', nodes: [0, 1], is: 1e-14, n: 1 },
        { kind: 'R', id: 'R1', nodes: [1, -1], r: 1000 },
      ],
      { stopTime: 40e-3, steps: 800 },
    );
    const out = r.nodeV[1];
    expect(Math.max(...out)).toBeGreaterThan(9.1);
    expect(Math.min(...out)).toBeGreaterThan(-1e-3);
  });

  it('biases an NPN common-emitter stage', () => {
    // 0 = vcc, 1 = vb_src, 2 = base, 3 = collector
    const r = run(4, [
      { kind: 'V', id: 'Vcc', nodes: [0, -1], wave: dc(10) },
      { kind: 'V', id: 'Vb', nodes: [1, -1], wave: dc(5) },
      { kind: 'R', id: 'Rb', nodes: [1, 2], r: 100e3 },
      { kind: 'R', id: 'Rc', nodes: [0, 3], r: 1000 },
      { kind: 'Q', id: 'Q1', nodes: [3, 2, -1], pol: 1, is: 1e-14, bf: 100, br: 1 },
    ]);
    const vb = r.nodeV[2][0];
    const vc = r.nodeV[3][0];
    expect(vb).toBeGreaterThan(0.6);
    expect(vb).toBeLessThan(0.75);
    const ib = (5 - vb) / 100e3;
    expect((10 - vc) / 1000).toBeCloseTo(100 * ib, 4);
    const [ic, ibq, ie] = r.pinI.get('Q1')!.map((a) => a[0]);
    expect(ibq).toBeCloseTo(ib, 8);
    expect(ic + ibq + ie).toBeCloseTo(0, 10);
  });

  it('biases a PNP mirror image of the same stage', () => {
    const r = run(4, [
      { kind: 'V', id: 'Vcc', nodes: [0, -1], wave: dc(-10) },
      { kind: 'V', id: 'Vb', nodes: [1, -1], wave: dc(-5) },
      { kind: 'R', id: 'Rb', nodes: [1, 2], r: 100e3 },
      { kind: 'R', id: 'Rc', nodes: [0, 3], r: 1000 },
      { kind: 'Q', id: 'Q1', nodes: [3, 2, -1], pol: -1, is: 1e-14, bf: 100, br: 1 },
    ]);
    const vb = r.nodeV[2][0];
    const vc = r.nodeV[3][0];
    expect(vb).toBeLessThan(-0.6);
    const ib = (-5 - vb) / 100e3;
    expect((-10 - vc) / 1000).toBeCloseTo(100 * ib, 4);
  });

  it('saturates an NPN switch', () => {
    const r = run(3, [
      { kind: 'V', id: 'Vcc', nodes: [0, -1], wave: dc(5) },
      { kind: 'R', id: 'Rb', nodes: [0, 1], r: 1000 },
      { kind: 'R', id: 'Rc', nodes: [0, 2], r: 1000 },
      { kind: 'Q', id: 'Q1', nodes: [2, 1, -1], pol: 1, is: 1e-14, bf: 100, br: 1 },
    ]);
    expect(r.nodeV[2][0]).toBeLessThan(0.3);
  });

  it('biases an NMOS in saturation', () => {
    // 0 = vdd, 1 = gate, 2 = drain
    const r = run(3, [
      { kind: 'V', id: 'Vdd', nodes: [0, -1], wave: dc(5) },
      { kind: 'V', id: 'Vg', nodes: [1, -1], wave: dc(2) },
      { kind: 'R', id: 'Rd', nodes: [0, 2], r: 1000 },
      { kind: 'M', id: 'M1', nodes: [2, 1, -1], pol: 1, vth: 1, beta: 1e-3, lambda: 0 },
    ]);
    expect(r.nodeV[2][0]).toBeCloseTo(4.5, 4);
  });

  it('biases a PMOS in saturation', () => {
    // source at vdd=5, gate at 3 → vsg = 2, |vth| = 1
    const r = run(3, [
      { kind: 'V', id: 'Vdd', nodes: [0, -1], wave: dc(5) },
      { kind: 'V', id: 'Vg', nodes: [1, -1], wave: dc(3) },
      { kind: 'M', id: 'M1', nodes: [2, 1, 0], pol: -1, vth: 1, beta: 1e-3, lambda: 0 },
      { kind: 'R', id: 'Rd', nodes: [2, -1], r: 1000 },
    ]);
    expect(r.nodeV[2][0]).toBeCloseTo(0.5, 4);
  });

  it('runs an NMOS inverter driven by a pulse', () => {
    const r = run(
      3,
      [
        { kind: 'V', id: 'Vdd', nodes: [0, -1], wave: dc(5) },
        {
          kind: 'V',
          id: 'Vin',
          nodes: [1, -1],
          wave: { type: 'pulse', v1: 0, v2: 5, delay: 0, rise: 0, fall: 0, width: 0.5e-3, period: 1e-3 },
        },
        { kind: 'R', id: 'Rd', nodes: [0, 2], r: 10e3 },
        { kind: 'M', id: 'M1', nodes: [2, 1, -1], pol: 1, vth: 1, beta: 1e-3, lambda: 0.01 },
      ],
      { stopTime: 2e-3, steps: 400 },
    );
    expect(r.nodeV[2][50]).toBeLessThan(0.2); // input high
    expect(r.nodeV[2][150]).toBeCloseTo(5, 3); // input low
  });
});

describe('op-amps', () => {
  const opamp = (nodes: [number, number, number]): ElementSpec => ({
    kind: 'OA',
    id: 'U1',
    nodes,
    gain: 1e5,
    vpos: 15,
    vneg: -15,
  });

  it('amplifies with an inverting configuration', () => {
    // 0 = vin, 1 = inverting input, 2 = out
    const r = run(3, [
      { kind: 'V', id: 'Vin', nodes: [0, -1], wave: dc(1) },
      { kind: 'R', id: 'Rin', nodes: [0, 1], r: 1000 },
      { kind: 'R', id: 'Rf', nodes: [1, 2], r: 2000 },
      opamp([1, -1, 2]),
    ]);
    expect(r.nodeV[2][0]).toBeCloseTo(-2, 3);
    expect(r.nodeV[1][0]).toBeCloseTo(0, 3);
  });

  it('clips an inverting amplifier at the rails over a sine', () => {
    const r = run(
      3,
      [
        { kind: 'V', id: 'Vin', nodes: [0, -1], wave: { type: 'sine', offset: 0, amplitude: 2, freq: 100, delay: 0, phase: 0 } },
        { kind: 'R', id: 'Rin', nodes: [0, 1], r: 1000 },
        { kind: 'R', id: 'Rf', nodes: [1, 2], r: 10e3 },
        opamp([1, -1, 2]),
      ],
      { stopTime: 20e-3, steps: 1000 },
    );
    const out = r.nodeV[2];
    expect(Math.max(...out)).toBeCloseTo(15, 1);
    expect(Math.min(...out)).toBeCloseTo(-15, 1);
    // t = 0.5 ms → vin = 2·sin(0.1π) ≈ 0.618, linear region: −6.18
    expect(out[25]).toBeCloseTo(-10 * 2 * Math.sin(2 * Math.PI * 100 * 0.5e-3), 2);
  });

  it('behaves as a comparator without feedback', () => {
    const r = run(
      2,
      [
        { kind: 'V', id: 'Vin', nodes: [0, -1], wave: { type: 'sine', offset: 0, amplitude: 1, freq: 100, delay: 0, phase: 0 } },
        opamp([-1, 0, 1]),
      ],
      { stopTime: 10e-3, steps: 500 },
    );
    expect(r.nodeV[1][100]).toBeCloseTo(15, 2); // t = 2 ms, vin > 0
    expect(r.nodeV[1][350]).toBeCloseTo(-15, 2); // t = 7 ms, vin < 0
  });

  it('integrates a square wave into a triangle', () => {
    // 0 = vin, 1 = inverting input, 2 = out
    const r = run(
      3,
      [
        {
          kind: 'V',
          id: 'Vin',
          nodes: [0, -1],
          wave: { type: 'pulse', v1: -1, v2: 1, delay: 0, rise: 0, fall: 0, width: 0.5e-3, period: 1e-3 },
        },
        { kind: 'R', id: 'R1', nodes: [0, 1], r: 10e3 },
        { kind: 'C', id: 'C1', nodes: [1, 2], c: 100e-9, ic: 0 },
        opamp([1, -1, 2]),
      ],
      { start: 'zero', stopTime: 1e-3, steps: 1000 },
    );
    // Slope = −vin/(RC) = −1000 V/s → after 0.5 ms, −0.5 V
    expect(r.nodeV[2][500]).toBeCloseTo(-0.5, 2);
    expect(r.nodeV[2][1000]).toBeCloseTo(0, 2);
  });
});
