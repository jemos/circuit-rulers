// Ready-made circuits. Coordinates are grid units; see kinds.ts for pin positions.

import { DocBuilder } from './doc';
import { Doc } from './types';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  build: () => Doc;
}

const sine = (amplitude: number, freq: number, offset = 0) =>
  ({ type: 'sine', offset, amplitude, freq, delay: 0, phase: 0 }) as const;
const step = (v2: number, delay: number) => ({ type: 'step', v1: 0, v2, delay, rise: 0 }) as const;

export const EXAMPLES: Example[] = [
  {
    id: 'divider',
    title: 'Voltage divider',
    blurb: 'R2 and R1 split Vdd in a fixed ratio. Scrub time: both drops scale together.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: sine(2.5, 100, 2.5) });
      b.add('label', 4, 4, { text: 'Vdd' });
      b.wire([4, 4], [4, 6]);
      b.add('ground', 4, 10);
      b.add('label', 12, 2, { text: 'Vdd' });
      b.wire([12, 2], [12, 4]);
      b.add('resistor', 12, 6, { name: 'R2', params: { r: 2000 } });
      b.add('resistor', 12, 10, { name: 'R1', params: { r: 1000 } });
      b.add('ground', 12, 12);
      const divider: [number, number][] = [
        [12, 2],
        [12, 8],
        [12, 12],
      ];
      b.ruler(divider, 17, 2, 10, 2.5e-3);
      b.ruler(divider, 31, 2, 10);
      b.doc.sim = { stopTime: 20e-3, steps: 1000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'rc',
    title: 'RC charging',
    blurb: 'At the step all of Vin drops across R1; as C1 charges the drop moves onto C1.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: step(5, 1e-3) });
      b.add('ground', 4, 10);
      b.wire([4, 6], [4, 3], [12, 3]);
      b.add('label', 8, 3, { text: 'Vin' });
      b.add('resistor', 12, 5, { name: 'R1', params: { r: 1000 } });
      b.add('capacitor', 12, 9, { name: 'C1', params: { c: 1e-6 } });
      b.add('ground', 12, 11);
      b.wire([12, 7], [14, 7]);
      b.add('label', 14, 7, { text: 'Vc' });
      const path: [number, number][] = [
        [12, 3],
        [12, 7],
        [12, 11],
      ];
      b.ruler(path, 18, 3, 8, 1.5e-3);
      b.ruler(path, 32, 3, 8);
      b.doc.sim = { stopTime: 6e-3, steps: 1200, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'rlc',
    title: 'RLC ringing',
    blurb: 'An underdamped series RLC: the capacitor overshoots Vin and L1’s voltage reverses.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: step(5, 0.5e-3) });
      b.add('ground', 4, 10);
      b.wire([4, 6], [4, 3], [6, 3]);
      b.add('label', 5, 3, { text: 'Vin' });
      b.add('resistor', 8, 3, { name: 'R1', rot: 3, params: { r: 20 } });
      b.add('inductor', 12, 3, { name: 'L1', rot: 3, params: { l: 1e-3 } });
      b.wire([14, 3], [16, 3], [16, 5]);
      b.add('label', 15, 3, { text: 'Vc' });
      b.add('capacitor', 16, 7, { name: 'C1', params: { c: 1e-6 } });
      b.add('ground', 16, 9);
      const path: [number, number][] = [
        [6, 3],
        [10, 3],
        [14, 3],
        [16, 9],
      ];
      b.ruler(path, 21, 2, 9, 0.6e-3);
      b.ruler(path, 37, 2, 9);
      b.doc.sim = { stopTime: 2.5e-3, steps: 2500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'rectifier',
    title: 'Half-wave rectifier',
    blurb: 'D1 conducts only near the peaks; C1 holds Vout up in between.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: sine(10, 50) });
      b.add('ground', 4, 10);
      b.wire([4, 6], [4, 3], [6, 3]);
      b.add('label', 5, 3, { text: 'Vin' });
      b.add('diode', 8, 3, { name: 'D1', rot: 3 });
      b.wire([10, 3], [16, 3], [16, 4]);
      b.add('label', 14, 3, { text: 'Vout' });
      b.add('capacitor', 12, 5, { name: 'C1', params: { c: 47e-6 } });
      b.add('ground', 12, 7);
      b.add('resistor', 16, 6, { name: 'R1', params: { r: 1000 } });
      b.add('ground', 16, 8);
      const path: [number, number][] = [
        [6, 3],
        [10, 3],
        [16, 8],
      ];
      b.ruler(path, 21, 2, 10, 5e-3);
      b.ruler(path, 35, 2, 10);
      b.doc.sim = { stopTime: 60e-3, steps: 1500, start: 'zero', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'ce-amp',
    title: 'Common-emitter amplifier',
    blurb: 'A small input wiggle on the base swings the collector by about Rc/Re times as much.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 2, 6, { name: 'V1', wave: { type: 'dc', value: 12 } });
      b.add('label', 2, 2, { text: 'Vcc' });
      b.wire([2, 2], [2, 4]);
      b.add('ground', 2, 8);

      b.add('label', 14, 2, { text: 'Vcc' });
      b.wire([14, 2], [14, 4]);
      b.add('resistor', 14, 6, { name: 'Rc', params: { r: 4700 } });
      b.wire([14, 8], [14, 10]);
      b.wire([14, 9], [17, 9]);
      b.add('label', 17, 9, { text: 'Vc' });
      b.add('npn', 14, 12, { name: 'Q1' });
      b.add('resistor', 14, 16, { name: 'Re', params: { r: 1000 } });
      b.add('ground', 14, 18);

      b.add('label', 8, 2, { text: 'Vcc' });
      b.wire([8, 2], [8, 4]);
      b.add('resistor', 8, 6, { name: 'Rb1', params: { r: 47e3 } });
      b.wire([8, 8], [8, 12], [12, 12]);
      b.add('label', 10, 12, { text: 'Vb' });
      b.add('resistor', 8, 14, { name: 'Rb2', params: { r: 10e3 } });
      b.add('ground', 8, 16);

      b.add('capacitor', 4, 12, { name: 'Cin', rot: 3, params: { c: 10e-6 } });
      b.wire([6, 12], [8, 12]);
      b.wire([0, 12], [2, 12]);
      b.add('vsource', 0, 14, { name: 'Vin', wave: sine(0.5, 1000) });
      b.add('ground', 0, 16);

      const path: [number, number][] = [
        [14, 4],
        [14, 10],
        [14, 14],
        [14, 18],
      ];
      b.ruler(path, 22, 2, 16, 0.25e-3);
      b.ruler(path, 36, 2, 16);
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'inverting',
    title: 'Inverting op-amp',
    blurb: 'The − input sits at a virtual ground; Vout mirrors Vin ×(−Rf/Rin) until it clips.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 2, 8, { name: 'V1', wave: sine(3, 500) });
      b.add('ground', 2, 10);
      b.wire([2, 6], [2, 4], [4, 4]);
      b.add('label', 3, 4, { text: 'Vin' });
      b.add('resistor', 6, 4, { name: 'Rin', rot: 3, params: { r: 1000 } });
      b.wire([8, 4], [10, 4]);
      b.add('resistor', 12, 1, { name: 'Rf', rot: 3, params: { r: 4700 } });
      b.wire([10, 1], [10, 7]);
      b.add('opamp', 12, 8, { name: 'U1', params: { vpos: 12, vneg: -12 } });
      b.wire([10, 9], [10, 10]);
      b.add('ground', 10, 10);
      b.wire([14, 1], [14, 8], [17, 8]);
      b.add('label', 16, 8, { text: 'Vout' });
      b.add('resistor', 17, 10, { name: 'RL', params: { r: 10e3 } });
      b.add('ground', 17, 12);
      const path: [number, number][] = [
        [2, 6],
        [10, 4],
        [17, 8],
      ];
      b.ruler(path, 22, 1, 12, 0.5e-3);
      b.ruler(path, 38, 1, 12);
      b.doc.sim = { stopTime: 4e-3, steps: 2000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'cmos',
    title: 'CMOS inverter',
    blurb: 'Only one transistor conducts at a time; during the input ramps both briefly do.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 1, 6, { name: 'V1', wave: { type: 'dc', value: 5 } });
      b.add('label', 1, 2, { text: 'Vdd' });
      b.wire([1, 2], [1, 4]);
      b.add('ground', 1, 8);

      b.add('label', 10, 2, { text: 'Vdd' });
      b.wire([10, 2], [10, 4]);
      b.add('pmos', 10, 6, { name: 'M2', rot: 2, flip: true });
      b.add('nmos', 10, 10, { name: 'M1' });
      b.add('ground', 10, 12);
      b.wire([8, 6], [8, 10]);
      b.wire([8, 8], [4, 8]);
      b.add('label', 6, 8, { text: 'Vin' });
      b.add('vsource', 4, 10, {
        name: 'V2',
        wave: { type: 'pulse', v1: 0, v2: 5, delay: 0.25e-3, rise: 0.3e-3, fall: 0.3e-3, width: 1e-3, period: 2.6e-3 },
      });
      b.add('ground', 4, 12);
      b.wire([10, 8], [17, 8]);
      b.add('label', 17, 8, { text: 'Vout' });
      b.add('capacitor', 14, 10, { name: 'CL', params: { c: 1e-6 } });
      b.add('ground', 14, 12);

      const path: [number, number][] = [
        [10, 4],
        [10, 8],
        [10, 12],
      ];
      b.ruler(path, 19, 2, 10, 0.4e-3);
      b.ruler(path, 33, 2, 10);
      b.doc.sim = { stopTime: 5e-3, steps: 2000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'diff-pair',
    title: 'Differential amplifier',
    blurb: 'A long-tailed pair: the tail holds the emitters together while a 10 mV input steers current between the halves.',
    build() {
      const b = new DocBuilder();
      // Supplies: Vcc = +12 V, Vee = −12 V
      b.add('vsource', 2, 6, { name: 'V1', wave: { type: 'dc', value: 12 } });
      b.add('label', 2, 2, { text: 'Vcc' });
      b.wire([2, 2], [2, 4]);
      b.add('ground', 2, 8);
      b.add('vsource', 2, 18, { name: 'V2', wave: { type: 'dc', value: -12 } });
      b.add('label', 2, 13, { text: 'Vee' });
      b.wire([2, 13], [2, 16]);
      b.add('ground', 2, 20);

      // Collector loads
      b.wire([12, 4], [12, 3], [18, 3], [18, 4]);
      b.add('label', 15, 3, { text: 'Vcc' });
      b.add('resistor', 12, 6, { name: 'Rc1', params: { r: 10e3 } });
      b.add('resistor', 18, 6, { name: 'Rc2', params: { r: 10e3 } });
      b.wire([12, 8], [12, 10]);
      b.wire([18, 8], [18, 10]);
      b.wire([12, 9], [9, 9]);
      b.add('label', 9, 9, { text: 'Vo1' });
      b.wire([18, 9], [21, 9]);
      b.add('label', 21, 9, { text: 'Vo2' });

      // The pair and its tail
      b.add('npn', 12, 12, { name: 'Q1' });
      b.add('npn', 18, 12, { name: 'Q2', flip: true });
      b.wire([12, 14], [12, 15], [18, 15], [18, 14]);
      b.add('label', 15, 15, { text: 'Vtail' });
      b.add('resistor', 15, 17, { name: 'Rt', params: { r: 11e3 } });
      b.wire([15, 19], [15, 20]);
      b.add('label', 15, 20, { text: 'Vee', rot: 2 });

      // Inputs: a small sine on Q1's base, Q2's base grounded
      b.wire([10, 12], [6, 12], [6, 14]);
      b.add('label', 8, 12, { text: 'Vin' });
      b.add('vsource', 6, 16, { name: 'V3', wave: { type: 'sine', offset: 0, amplitude: 10e-3, freq: 1000, delay: 0, phase: 0 } });
      b.add('ground', 6, 18);
      b.wire([20, 12], [22, 12]);
      b.add('ground', 22, 12);

      b.ruler(
        [
          [12, 4],
          [12, 10],
          [15, 15],
          [15, 19],
        ],
        27,
        2,
        16,
        null,
        { name: 'Left half' },
      );
      const out: [number, number][] = [
        [12, 10],
        [18, 10],
      ];
      b.ruler(out, 41, 2, 16, null, { name: 'Output (live)', scale: { min: 4.5, max: 9.5 } });
      b.ruler(out, 55, 2, 16, 0.25e-3, { name: 'Output at input peak', scale: { min: 4.5, max: 9.5 } });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'shunt',
    title: 'High-side current sense',
    blurb: 'The shunt’s drop is tiny and floats near 12 V; a gain-of-20 difference amplifier brings it down to ground.',
    build() {
      const b = new DocBuilder();
      // 12 V bus through a 0.1 Ω shunt into the load
      b.add('vsource', 2, 10, { name: 'V1', wave: { type: 'dc', value: 12 } });
      b.add('ground', 2, 12);
      b.wire([2, 8], [2, 4], [14, 4], [14, 7], [16, 7]);
      b.add('label', 5, 4, { text: 'Vbus' });
      b.add('resistor', 8, 6, { name: 'Rs', params: { r: 0.1 } });
      b.wire([8, 8], [8, 10], [12, 10], [14, 10], [14, 11], [16, 11]);
      b.add('label', 10, 10, { text: 'Vload' });
      b.add('resistor', 8, 12, { name: 'Rload', params: { r: 24 } });
      b.add('ground', 8, 14);
      // A load that steps between 0 and 1 A on top of the 0.5 A resistor
      b.add('isource', 12, 12, {
        name: 'Iload',
        rot: 2,
        flip: true,
        wave: { type: 'pulse', v1: 0, v2: 1, delay: 1e-3, rise: 0.5e-3, fall: 0.5e-3, width: 2e-3, period: 5e-3 },
      });
      b.add('ground', 12, 14);

      // Difference amplifier: Vsense = (Rf/R1)·(Vbus − Vload) = 20 × shunt drop
      b.add('opamp', 24, 8, { name: 'U1', rot: 2, flip: true, params: { vpos: 15, vneg: -15 } });
      b.add('resistor', 18, 7, { name: 'R2', rot: 3, params: { r: 1000 } });
      b.wire([20, 7], [22, 7]);
      b.add('resistor', 20, 5, { name: 'R3', params: { r: 20e3 } });
      b.add('ground', 20, 3, { rot: 2 });
      b.add('resistor', 18, 11, { name: 'R1', rot: 3, params: { r: 1000 } });
      b.wire([20, 11], [22, 11], [22, 9]);
      b.wire([22, 11], [22, 13]);
      b.add('resistor', 24, 13, { name: 'Rf', rot: 3, params: { r: 20e3 } });
      b.wire([26, 8], [26, 13]);
      b.wire([26, 8], [29, 8]);
      b.add('label', 28, 8, { text: 'Vsense' });

      b.ruler(
        [
          [8, 4],
          [8, 8],
          [8, 14],
        ],
        33,
        2,
        12,
        null,
        { name: 'Bus → load' },
      );
      b.ruler(
        [
          [8, 4],
          [8, 8],
        ],
        47,
        2,
        12,
        null,
        { name: 'Shunt (zoomed)', scale: { min: 11.8, max: 12.02 } },
      );
      b.ruler(
        [
          [28, 8],
          [8, 14],
        ],
        61,
        2,
        12,
        null,
        { name: 'Sense output' },
      );
      b.doc.sim = { stopTime: 8e-3, steps: 1600, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
];
