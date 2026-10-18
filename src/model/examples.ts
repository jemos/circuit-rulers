// Ready-made circuits. Coordinates are grid units; see kinds.ts for pin positions.

import { DocBuilder } from './doc';
import { Doc } from './types';

export const EXAMPLE_GROUPS = ['Basics', 'BJT stages', 'MOSFET stages', 'Output & multi-stage', 'Op-amp circuits'] as const;

export interface Example {
  id: string;
  title: string;
  group: (typeof EXAMPLE_GROUPS)[number];
  blurb: string;
  build: () => Doc;
}

const sine = (amplitude: number, freq: number, offset = 0) =>
  ({ type: 'sine', offset, amplitude, freq, delay: 0, phase: 0 }) as const;
const step = (v2: number, delay: number) => ({ type: 'step', v1: 0, v2, delay, rise: 0 }) as const;

/** A DC supply: net label at (x, y) on top of a grounded source. */
function rail(b: DocBuilder, x: number, y: number, name: string, text: string, value: number) {
  b.add('label', x, y, { text });
  b.wire([x, y], [x, y + 2]);
  b.add('vsource', x, y + 4, { name, wave: { type: 'dc', value } });
  b.wire([x, y + 6], [x, y + 8]);
  b.add('ground', x, y + 8);
}

export const EXAMPLES: Example[] = [
  {
    id: 'divider',
    title: 'Voltage divider',
    group: 'Basics',
    blurb: 'R2 and R1 split Vdd in a fixed ratio. Scrub time: both drops scale together.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: sine(2.5, 100, 2.5) });
      b.add('label', 4, 4, { text: 'Vdd' });
      b.wire([4, 4], [4, 6]);
      b.wire([4, 10], [4, 12]);
      b.add('ground', 4, 12);
      b.add('label', 12, 2, { text: 'Vdd' });
      b.wire([12, 2], [12, 4]);
      b.add('resistor', 12, 6, { name: 'R2', params: { r: 2000 } });
      b.wire([12, 8], [12, 10]);
      b.add('resistor', 12, 12, { name: 'R1', params: { r: 1000 } });
      b.wire([12, 14], [12, 16]);
      b.add('ground', 12, 16);
      const divider: [number, number][] = [
        [12, 2],
        [12, 8],
        [12, 16],
      ];
      b.ruler(divider, 17, 2, 14, 2.5e-3);
      b.ruler(divider, 31, 2, 14);
      b.doc.sim = { stopTime: 20e-3, steps: 1000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'rc',
    title: 'RC charging',
    group: 'Basics',
    blurb: 'At the step all of Vin drops across R1; as C1 charges the drop moves onto C1.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: step(5, 1e-3) });
      b.wire([4, 10], [4, 12]);
      b.add('ground', 4, 12);
      b.wire([4, 6], [4, 3], [12, 3]);
      b.add('label', 8, 3, { text: 'Vin' });
      b.add('resistor', 12, 5, { name: 'R1', params: { r: 1000 } });
      b.wire([12, 7], [12, 9]);
      b.add('capacitor', 12, 11, { name: 'C1', params: { c: 1e-6 } });
      b.wire([12, 13], [12, 15]);
      b.add('ground', 12, 15);
      b.wire([12, 8], [15, 8]);
      b.add('label', 15, 8, { text: 'Vc' });
      const path: [number, number][] = [
        [12, 3],
        [12, 7],
        [12, 15],
      ];
      b.ruler(path, 19, 3, 12, 1.5e-3);
      b.ruler(path, 33, 3, 12);
      b.doc.sim = { stopTime: 6e-3, steps: 1200, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'rlc',
    title: 'RLC ringing',
    group: 'Basics',
    blurb: 'An underdamped series RLC: the capacitor overshoots Vin and L1’s voltage reverses.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: step(5, 0.5e-3) });
      b.wire([4, 10], [4, 12]);
      b.add('ground', 4, 12);
      b.wire([4, 6], [4, 3], [6, 3]);
      b.add('label', 5, 3, { text: 'Vin' });
      b.add('resistor', 8, 3, { name: 'R1', rot: 3, params: { r: 20 } });
      b.wire([10, 3], [12, 3]);
      b.add('inductor', 14, 3, { name: 'L1', rot: 3, params: { l: 1e-3 } });
      b.wire([16, 3], [19, 3], [19, 5]);
      b.add('label', 18, 3, { text: 'Vc' });
      b.add('capacitor', 19, 7, { name: 'C1', params: { c: 1e-6 } });
      b.wire([19, 9], [19, 11]);
      b.add('ground', 19, 11);
      const path: [number, number][] = [
        [6, 3],
        [10, 3],
        [16, 3],
        [19, 11],
      ];
      b.ruler(path, 24, 2, 10, 0.6e-3);
      b.ruler(path, 40, 2, 10);
      b.doc.sim = { stopTime: 2.5e-3, steps: 2500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'rectifier',
    title: 'Half-wave rectifier',
    group: 'Basics',
    blurb: 'D1 conducts only near the peaks; C1 holds Vout up in between.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 4, 8, { name: 'V1', wave: sine(10, 50) });
      b.wire([4, 10], [4, 12]);
      b.add('ground', 4, 12);
      b.wire([4, 6], [4, 3], [6, 3]);
      b.add('label', 5, 3, { text: 'Vin' });
      b.add('diode', 8, 3, { name: 'D1', rot: 3 });
      b.wire([10, 3], [17, 3], [17, 5]);
      b.add('label', 15, 3, { text: 'Vout' });
      b.wire([12, 3], [12, 5]);
      b.add('capacitor', 12, 7, { name: 'C1', params: { c: 47e-6 } });
      b.wire([12, 9], [12, 11]);
      b.add('ground', 12, 11);
      b.add('resistor', 17, 7, { name: 'R1', params: { r: 1000 } });
      b.wire([17, 9], [17, 11]);
      b.add('ground', 17, 11);
      const path: [number, number][] = [
        [6, 3],
        [10, 3],
        [17, 11],
      ];
      b.ruler(path, 22, 2, 10, 5e-3);
      b.ruler(path, 36, 2, 10);
      b.doc.sim = { stopTime: 60e-3, steps: 1500, start: 'zero', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'ce-amp',
    title: 'Common-emitter amplifier',
    group: 'BJT stages',
    blurb: 'A small input wiggle on the base swings the collector by about Rc/Re times as much.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 2, 6, { name: 'V1', wave: { type: 'dc', value: 12 } });
      b.add('label', 2, 2, { text: 'Vcc' });
      b.wire([2, 2], [2, 4]);
      b.wire([2, 8], [2, 10]);
      b.add('ground', 2, 10);

      b.add('label', 14, 2, { text: 'Vcc' });
      b.wire([14, 2], [14, 4]);
      b.add('resistor', 14, 6, { name: 'Rc', params: { r: 4700 } });
      b.wire([14, 8], [14, 10]);
      b.wire([14, 9], [17, 9]);
      b.add('label', 17, 9, { text: 'Vc' });
      b.add('npn', 14, 12, { name: 'Q1' });
      b.wire([14, 14], [14, 16]);
      b.add('resistor', 14, 18, { name: 'Re', params: { r: 1000 } });
      b.wire([14, 20], [14, 22]);
      b.add('ground', 14, 22);

      b.add('label', 8, 2, { text: 'Vcc' });
      b.wire([8, 2], [8, 4]);
      b.add('resistor', 8, 6, { name: 'Rb1', params: { r: 47e3 } });
      b.wire([8, 8], [8, 12], [12, 12]);
      b.add('label', 10, 12, { text: 'Vb' });
      b.wire([8, 12], [8, 14]);
      b.add('resistor', 8, 16, { name: 'Rb2', params: { r: 10e3 } });
      b.wire([8, 18], [8, 20]);
      b.add('ground', 8, 20);

      b.add('capacitor', 4, 12, { name: 'Cin', rot: 3, params: { c: 10e-6 } });
      b.wire([6, 12], [8, 12]);
      b.wire([0, 15], [0, 12], [2, 12]);
      b.add('vsource', 0, 17, { name: 'Vin', wave: sine(0.5, 1000) });
      b.wire([0, 19], [0, 21]);
      b.add('ground', 0, 21);

      const path: [number, number][] = [
        [14, 4],
        [14, 10],
        [14, 14],
        [14, 22],
      ];
      b.ruler(path, 22, 2, 20, 0.25e-3);
      b.ruler(path, 36, 2, 20);
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'ce-bypass',
    title: 'Common emitter, bypassed Re',
    group: 'BJT stages',
    blurb: 'Ce shorts Re for the signal but not for the bias: the gain jumps to about Rc/re ≈ 250, and a 10 mV input already distorts.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vcc', 12);

      b.add('label', 14, 2, { text: 'Vcc' });
      b.wire([14, 2], [14, 4]);
      b.add('resistor', 14, 6, { name: 'Rc', params: { r: 4700 } });
      b.wire([14, 8], [14, 10]);
      b.wire([14, 9], [17, 9]);
      b.add('label', 17, 9, { text: 'Vc' });
      b.add('npn', 14, 12, { name: 'Q1' });
      b.wire([14, 14], [14, 16], [19, 16], [19, 17]);
      b.add('label', 17, 16, { text: 'Ve' });
      b.add('resistor', 14, 18, { name: 'Re', params: { r: 1000 } });
      b.wire([14, 20], [14, 22]);
      b.add('ground', 14, 22);
      b.add('capacitor', 19, 19, { name: 'Ce', params: { c: 100e-6 } });
      b.wire([19, 21], [19, 22]);
      b.add('ground', 19, 22);

      b.add('label', 8, 2, { text: 'Vcc' });
      b.wire([8, 2], [8, 4]);
      b.add('resistor', 8, 6, { name: 'Rb1', params: { r: 47e3 } });
      b.wire([8, 8], [8, 12], [12, 12]);
      b.add('label', 10, 12, { text: 'Vb' });
      b.wire([8, 12], [8, 14]);
      b.add('resistor', 8, 16, { name: 'Rb2', params: { r: 10e3 } });
      b.wire([8, 18], [8, 20]);
      b.add('ground', 8, 20);

      b.add('capacitor', 4, 12, { name: 'Cin', rot: 3, params: { c: 10e-6 } });
      b.wire([6, 12], [8, 12]);
      b.wire([0, 15], [0, 12], [2, 12]);
      b.add('vsource', 0, 17, { name: 'Vin', wave: sine(10e-3, 1000) });
      b.wire([0, 19], [0, 21]);
      b.add('ground', 0, 21);

      const path: [number, number][] = [
        [14, 4],
        [14, 10],
        [14, 16],
        [14, 22],
      ];
      b.ruler(path, 25, 2, 20, 0.25e-3, { name: 'Input peak' });
      b.ruler(path, 39, 2, 20, 0.75e-3, { name: 'Input trough' });
      b.ruler(path, 53, 2, 20, null, { name: 'Live' });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'cb',
    title: 'Common base',
    group: 'BJT stages',
    blurb: 'The emitter is a low-impedance input: it barely moves, so Rs carries almost all of Vin and its current passes straight to the collector.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vcc', 12);
      rail(b, 2, 14, 'V2', 'Vee', -12);

      b.add('label', 20, 2, { text: 'Vcc' });
      b.wire([20, 2], [20, 4]);
      b.add('resistor', 20, 6, { name: 'Rc', params: { r: 4700 } });
      b.wire([20, 8], [20, 10]);
      b.wire([20, 9], [23, 9]);
      b.add('label', 23, 9, { text: 'Vout' });
      b.add('npn', 20, 12, { name: 'Q1' });
      b.wire([18, 12], [16, 12], [16, 14]);
      b.add('ground', 16, 14);
      b.wire([20, 14], [20, 18], [23, 18]);
      b.add('label', 23, 18, { text: 'Ve' });
      b.add('resistor', 20, 20, { name: 'Re', params: { r: 11e3 } });
      b.wire([20, 22], [20, 24]);
      b.add('label', 20, 24, { text: 'Vee', rot: 2 });

      // Input: coupled through Cin, with a 1 kΩ source resistance
      b.add('vsource', 6, 20, { name: 'V3', wave: sine(0.3, 1000) });
      b.wire([6, 22], [6, 24]);
      b.add('ground', 6, 24);
      b.wire([6, 18], [9, 18]);
      b.add('label', 7, 18, { text: 'Vin' });
      b.add('capacitor', 11, 18, { name: 'Cin', rot: 3, params: { c: 10e-6 } });
      b.wire([13, 18], [14, 18]);
      b.add('resistor', 16, 18, { name: 'Rs', rot: 3, params: { r: 1000 } });
      b.wire([18, 18], [20, 18]);

      b.ruler(
        [
          [20, 4],
          [20, 8],
          [20, 18],
          [20, 24],
        ],
        28,
        2,
        20,
        null,
        { name: 'Collector side' },
      );
      b.ruler(
        [
          [6, 18],
          [14, 18],
          [20, 18],
          [16, 14],
        ],
        42,
        2,
        20,
        null,
        { name: 'Input', scale: { min: -1.5, max: 1.5 } },
      );
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'ef',
    title: 'Emitter follower',
    group: 'BJT stages',
    blurb: 'The emitter follows the base one Vbe lower. Vbe hardly changes while the current through Re varies sevenfold.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vcc', 12);

      b.add('label', 14, 4, { text: 'Vcc' });
      b.wire([14, 4], [14, 8]);
      b.add('npn', 14, 10, { name: 'Q1' });
      b.wire([14, 12], [14, 14]);
      b.wire([14, 13], [17, 13]);
      b.add('label', 17, 13, { text: 'Vout' });
      b.add('resistor', 14, 16, { name: 'Re', params: { r: 1000 } });
      b.wire([14, 18], [14, 20]);
      b.add('ground', 14, 20);

      b.wire([12, 10], [6, 10], [6, 13]);
      b.add('label', 9, 10, { text: 'Vin' });
      b.add('vsource', 6, 15, { name: 'V2', wave: sine(4, 1000, 6) });
      b.wire([6, 17], [6, 19]);
      b.add('ground', 6, 19);

      const path: [number, number][] = [
        [6, 13],
        [14, 14],
        [14, 20],
      ];
      b.ruler(path, 21, 2, 18, 0.25e-3, { name: 'Input peak' });
      b.ruler(path, 35, 2, 18, 0.75e-3, { name: 'Input trough' });
      b.ruler(path, 49, 2, 18, null, { name: 'Live' });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'mirror',
    title: 'Current mirror',
    group: 'BJT stages',
    blurb: 'Q2 copies Q1’s 1 mA, so RL’s drop stays put while Vsweep moves, until Q2 runs out of room and saturates.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vcc', 12);
      b.add('label', 2, 14, { text: 'Vsweep' });
      b.wire([2, 14], [2, 16]);
      b.add('vsource', 2, 18, { name: 'V2', wave: sine(5, 500, 6) });
      b.wire([2, 20], [2, 22]);
      b.add('ground', 2, 22);

      // Reference side: Q1 is diode-connected, so Iref sets its Vbe
      b.add('label', 10, 2, { text: 'Vcc' });
      b.wire([10, 2], [10, 4]);
      b.add('resistor', 10, 6, { name: 'Rref', params: { r: 11.3e3 } });
      b.wire([10, 8], [10, 10]);
      b.wire([10, 9], [13, 9], [13, 12]);
      b.add('npn', 10, 12, { name: 'Q1', flip: true });
      b.wire([12, 12], [14, 12]);
      b.add('npn', 16, 12, { name: 'Q2' });
      b.wire([10, 14], [10, 16]);
      b.add('ground', 10, 16);
      b.wire([16, 14], [16, 16]);
      b.add('ground', 16, 16);

      // Output side: a load fed from a swept voltage
      b.add('label', 16, 2, { text: 'Vsweep' });
      b.wire([16, 2], [16, 4]);
      b.add('resistor', 16, 6, { name: 'RL', params: { r: 2000 } });
      b.wire([16, 8], [16, 10]);
      b.wire([16, 9], [19, 9]);
      b.add('label', 19, 9, { text: 'Vout' });

      b.ruler(
        [
          [10, 4],
          [10, 8],
          [10, 16],
        ],
        24,
        2,
        14,
        null,
        { name: 'Reference' },
      );
      const out: [number, number][] = [
        [16, 4],
        [16, 8],
        [16, 16],
      ];
      b.ruler(out, 38, 2, 14, null, { name: 'Output (live)' });
      b.ruler(out, 52, 2, 14, 1.5e-3, { name: 'Output at the dip' });
      b.doc.sim = { stopTime: 4e-3, steps: 1600, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'inverting',
    title: 'Inverting op-amp',
    group: 'Op-amp circuits',
    blurb: 'The − input sits at a virtual ground; Vout mirrors Vin ×(−Rf/Rin) until it clips.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 2, 8, { name: 'V1', wave: sine(3, 500) });
      b.wire([2, 10], [2, 12]);
      b.add('ground', 2, 12);
      b.wire([2, 6], [2, 4], [4, 4]);
      b.add('label', 3, 4, { text: 'Vin' });
      b.add('resistor', 6, 4, { name: 'Rin', rot: 3, params: { r: 1000 } });
      b.wire([8, 4], [10, 4]);
      b.add('resistor', 12, 1, { name: 'Rf', rot: 3, params: { r: 4700 } });
      b.wire([10, 1], [10, 7]);
      b.add('opamp', 12, 8, { name: 'U1', params: { vpos: 12, vneg: -12 } });
      b.wire([10, 9], [10, 11]);
      b.add('ground', 10, 11);
      b.wire([14, 1], [14, 8], [18, 8], [18, 10]);
      b.add('label', 16, 8, { text: 'Vout' });
      b.add('resistor', 18, 12, { name: 'RL', params: { r: 10e3 } });
      b.wire([18, 14], [18, 16]);
      b.add('ground', 18, 16);
      const path: [number, number][] = [
        [2, 6],
        [10, 4],
        [18, 8],
      ];
      b.ruler(path, 23, 1, 15, 0.5e-3);
      b.ruler(path, 39, 1, 15);
      b.doc.sim = { stopTime: 4e-3, steps: 2000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'noninverting',
    title: 'Non-inverting op-amp',
    group: 'Op-amp circuits',
    blurb: 'Feedback holds V− on top of Vin (the faint trace), so Rg carries Vin/Rg and the same current through Rf adds twice as much again: Vout = 3 × Vin.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 2, 12, { name: 'V1', wave: sine(2, 500) });
      b.wire([2, 14], [2, 16]);
      b.add('ground', 2, 16);
      b.wire([2, 10], [2, 7], [10, 7]);
      b.add('label', 6, 7, { text: 'Vin' });
      b.add('opamp', 12, 8, { name: 'U1', rot: 2, flip: true, params: { vpos: 12, vneg: -12 } });
      b.wire([10, 9], [10, 14]);
      b.add('resistor', 12, 14, { name: 'Rf', rot: 3, params: { r: 2000 } });
      b.wire([14, 8], [14, 14]);
      b.wire([10, 11], [8, 11]);
      b.add('label', 8, 11, { text: 'V−' });
      b.add('resistor', 10, 16, { name: 'Rg', params: { r: 1000 } });
      b.wire([10, 18], [10, 20]);
      b.add('ground', 10, 20);
      b.wire([14, 8], [18, 8], [18, 10]);
      b.add('label', 16, 8, { text: 'Vout' });
      b.add('resistor', 18, 12, { name: 'RL', params: { r: 10e3 } });
      b.wire([18, 14], [18, 16]);
      b.add('ground', 18, 16);

      const path: [number, number][] = [
        [18, 8],
        [10, 14],
        [10, 20],
      ];
      b.ruler(path, 23, 1, 19, 0.5e-3, { name: 'Input peak' });
      b.ruler(path, 37, 1, 19, null, { name: 'Live' });
      b.doc.probes = [{ x: 2, y: 10 }];
      b.doc.sim = { stopTime: 4e-3, steps: 2000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'summing',
    title: 'Summing amplifier',
    group: 'Op-amp circuits',
    blurb: 'The − input is a virtual ground where the currents through R1 and R2 add up; Rf turns their sum into Vout = −(Vin1 + Vin2).',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 2, 9, { name: 'V1', wave: sine(2, 500) });
      b.wire([2, 11], [2, 13]);
      b.add('ground', 2, 13);
      b.wire([2, 7], [2, 5], [10, 5]);
      b.add('label', 6, 5, { text: 'Vin1' });
      b.add('vsource', 8, 13, {
        name: 'V2',
        wave: { type: 'pulse', v1: 0, v2: 3, delay: 1e-3, rise: 0, fall: 0, width: 2e-3, period: 4e-3 },
      });
      b.wire([8, 15], [8, 17]);
      b.add('ground', 8, 17);
      b.wire([8, 11], [8, 8], [10, 8]);
      b.add('label', 9, 8, { text: 'Vin2' });

      b.add('resistor', 12, 5, { name: 'R1', rot: 3, params: { r: 10e3 } });
      b.add('resistor', 12, 8, { name: 'R2', rot: 3, params: { r: 10e3 } });
      b.wire([14, 5], [16, 5], [16, 9]);
      b.wire([14, 8], [16, 8]);
      b.add('resistor', 18, 2, { name: 'Rf', rot: 3, params: { r: 10e3 } });
      b.wire([16, 2], [16, 5]);
      b.add('opamp', 18, 10, { name: 'U1', params: { vpos: 12, vneg: -12 } });
      b.wire([16, 11], [16, 13]);
      b.add('ground', 16, 13);
      b.wire([20, 2], [20, 10], [24, 10]);
      b.add('label', 24, 10, { text: 'Vout' });

      b.ruler(
        [
          [10, 5],
          [16, 9],
          [24, 10],
        ],
        28,
        1,
        16,
        null,
        { name: 'Through R1' },
      );
      b.ruler(
        [
          [10, 8],
          [16, 9],
          [24, 10],
        ],
        42,
        1,
        16,
        null,
        { name: 'Through R2' },
      );
      b.doc.sim = { stopTime: 8e-3, steps: 2000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'integrator',
    title: 'Op-amp integrator',
    group: 'Op-amp circuits',
    blurb: 'With the − input at virtual ground, R1 turns Vin into a steady current that charges C1: a square wave in becomes a triangle out.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 2, 8, {
        name: 'V1',
        wave: { type: 'pulse', v1: -5, v2: 5, delay: 0.5e-3, rise: 1e-6, fall: 1e-6, width: 1e-3, period: 2e-3 },
      });
      b.wire([2, 10], [2, 12]);
      b.add('ground', 2, 12);
      b.wire([2, 6], [2, 4], [4, 4]);
      b.add('label', 3, 4, { text: 'Vin' });
      b.add('resistor', 6, 4, { name: 'R1', rot: 3, params: { r: 10e3 } });
      b.wire([8, 4], [10, 4]);
      b.add('capacitor', 12, 4, { name: 'C1', rot: 3, params: { c: 100e-9 } });
      // Rf bleeds off the DC that an ideal integrator would accumulate forever
      b.add('resistor', 12, 1, { name: 'Rf', rot: 3, params: { r: 1e6 } });
      b.wire([10, 1], [10, 7]);
      b.add('opamp', 12, 8, { name: 'U1', params: { vpos: 12, vneg: -12 } });
      b.wire([10, 9], [10, 11]);
      b.add('ground', 10, 11);
      b.wire([14, 1], [14, 8], [18, 8]);
      b.add('label', 18, 8, { text: 'Vout' });

      const path: [number, number][] = [
        [2, 6],
        [10, 4],
        [18, 8],
      ];
      b.ruler(path, 22, 1, 15, 1.5e-3, { name: 'End of a ramp' });
      b.ruler(path, 36, 1, 15, null, { name: 'Live' });
      b.doc.sim = { stopTime: 6e-3, steps: 1500, start: 'zero', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'cmos',
    title: 'CMOS inverter',
    group: 'MOSFET stages',
    blurb: 'Only one transistor conducts at a time; during the input ramps both briefly do.',
    build() {
      const b = new DocBuilder();
      b.add('vsource', 1, 6, { name: 'V1', wave: { type: 'dc', value: 5 } });
      b.add('label', 1, 2, { text: 'Vdd' });
      b.wire([1, 2], [1, 4]);
      b.wire([1, 8], [1, 10]);
      b.add('ground', 1, 10);

      b.add('label', 10, 2, { text: 'Vdd' });
      b.wire([10, 2], [10, 4]);
      b.add('pmos', 10, 6, { name: 'M2', rot: 2, flip: true });
      b.wire([10, 8], [10, 10]);
      b.add('nmos', 10, 12, { name: 'M1' });
      b.wire([10, 14], [10, 16]);
      b.add('ground', 10, 16);
      b.wire([8, 6], [8, 12]);
      b.wire([8, 9], [4, 9]);
      b.add('label', 6, 9, { text: 'Vin' });
      b.add('vsource', 4, 11, {
        name: 'V2',
        wave: { type: 'pulse', v1: 0, v2: 5, delay: 0.25e-3, rise: 0.3e-3, fall: 0.3e-3, width: 1e-3, period: 2.6e-3 },
      });
      b.wire([4, 13], [4, 15]);
      b.add('ground', 4, 15);
      b.wire([10, 9], [17, 9]);
      b.add('label', 17, 9, { text: 'Vout' });
      b.add('capacitor', 14, 11, { name: 'CL', params: { c: 1e-6 } });
      b.wire([14, 13], [14, 15]);
      b.add('ground', 14, 15);

      const path: [number, number][] = [
        [10, 4],
        [10, 9],
        [10, 16],
      ];
      b.ruler(path, 21, 2, 14, 0.4e-3);
      b.ruler(path, 35, 2, 14);
      b.doc.sim = { stopTime: 5e-3, steps: 2000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'cs-amp',
    title: 'Common source',
    group: 'MOSFET stages',
    blurb: 'A ±0.2 V gate wiggle swings the drain by about gm·RD ≈ 10 times as much, further down than up: the drain current is square-law in Vgs.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vdd', 10);

      b.add('label', 12, 2, { text: 'Vdd' });
      b.wire([12, 2], [12, 4]);
      b.add('resistor', 12, 6, { name: 'RD', params: { r: 10e3 } });
      b.wire([12, 8], [12, 10]);
      b.wire([12, 9], [15, 9]);
      b.add('label', 15, 9, { text: 'Vout' });
      b.add('nmos', 12, 12, { name: 'M1' });
      b.wire([12, 14], [12, 16]);
      b.add('ground', 12, 16);

      b.wire([10, 12], [6, 12], [6, 15]);
      b.add('label', 8, 12, { text: 'Vin' });
      b.add('vsource', 6, 17, { name: 'V2', wave: sine(0.2, 1000, 2) });
      b.wire([6, 19], [6, 21]);
      b.add('ground', 6, 21);

      const path: [number, number][] = [
        [12, 4],
        [12, 8],
        [12, 16],
      ];
      b.ruler(path, 19, 2, 14, 0.25e-3, { name: 'Input peak' });
      b.ruler(path, 33, 2, 14, 0.75e-3, { name: 'Input trough' });
      b.ruler(path, 47, 2, 14, null, { name: 'Live' });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'sf',
    title: 'Source follower',
    group: 'MOSFET stages',
    blurb: 'The source follows the gate, but Vgs grows with the current, so the output lags Vin by more at the top than at the bottom: gain is a bit under 1.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vdd', 10);

      b.add('label', 12, 4, { text: 'Vdd' });
      b.wire([12, 4], [12, 8]);
      b.add('nmos', 12, 10, { name: 'M1' });
      b.wire([12, 12], [12, 14]);
      b.wire([12, 13], [15, 13]);
      b.add('label', 15, 13, { text: 'Vout' });
      b.add('resistor', 12, 16, { name: 'RS', params: { r: 10e3 } });
      b.wire([12, 18], [12, 20]);
      b.add('ground', 12, 20);

      b.wire([10, 10], [6, 10], [6, 13]);
      b.add('label', 8, 10, { text: 'Vin' });
      b.add('vsource', 6, 15, { name: 'V2', wave: sine(3, 1000, 5) });
      b.wire([6, 17], [6, 19]);
      b.add('ground', 6, 19);

      const path: [number, number][] = [
        [6, 13],
        [12, 14],
        [12, 20],
      ];
      b.ruler(path, 19, 2, 18, 0.25e-3, { name: 'Input peak' });
      b.ruler(path, 33, 2, 18, 0.75e-3, { name: 'Input trough' });
      b.ruler(path, 47, 2, 18, null, { name: 'Live' });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'cg',
    title: 'Common gate',
    group: 'MOSFET stages',
    blurb: 'The MOS cousin of the common base. Its input resistance, about 1/gm, is much higher than a BJT’s, so the source moves visibly with Vin.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vdd', 10);
      rail(b, 2, 14, 'V2', 'Vbias', 3);

      b.add('label', 20, 2, { text: 'Vdd' });
      b.wire([20, 2], [20, 4]);
      b.add('resistor', 20, 6, { name: 'RD', params: { r: 10e3 } });
      b.wire([20, 8], [20, 10]);
      b.wire([20, 9], [23, 9]);
      b.add('label', 23, 9, { text: 'Vout' });
      b.add('nmos', 20, 12, { name: 'M1' });
      b.wire([18, 12], [16, 12]);
      b.add('label', 16, 12, { text: 'Vbias' });
      b.wire([20, 14], [20, 18], [23, 18]);
      b.add('label', 23, 18, { text: 'Vs' });
      b.add('resistor', 20, 20, { name: 'RS', params: { r: 2000 } });
      b.wire([20, 22], [20, 24]);
      b.add('ground', 20, 24);

      b.add('vsource', 6, 20, { name: 'V3', wave: sine(0.3, 1000) });
      b.wire([6, 22], [6, 24]);
      b.add('ground', 6, 24);
      b.wire([6, 18], [9, 18]);
      b.add('label', 7, 18, { text: 'Vin' });
      b.add('capacitor', 11, 18, { name: 'Cin', rot: 3, params: { c: 10e-6 } });
      b.wire([13, 18], [14, 18]);
      b.add('resistor', 16, 18, { name: 'Rsig', rot: 3, params: { r: 1000 } });
      b.wire([18, 18], [20, 18]);

      b.ruler(
        [
          [20, 4],
          [20, 8],
          [20, 18],
          [20, 24],
        ],
        28,
        2,
        22,
        null,
        { name: 'Drain side' },
      );
      b.ruler(
        [
          [6, 18],
          [14, 18],
          [20, 18],
          [16, 12],
        ],
        42,
        2,
        22,
        null,
        { name: 'Input', scale: { min: -1, max: 3.5 } },
      );
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'cascode',
    title: 'Cascode',
    group: 'MOSFET stages',
    blurb: 'M2’s gate is held at 4 V, which pins M1’s drain near 2 V: the output swings by volts while M1 sees an almost constant Vds.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vdd', 10);
      rail(b, 2, 14, 'V2', 'Vbias', 4);

      b.add('label', 12, 2, { text: 'Vdd' });
      b.wire([12, 2], [12, 4]);
      b.add('resistor', 12, 6, { name: 'RD', params: { r: 10e3 } });
      b.wire([12, 8], [12, 10]);
      b.wire([12, 9], [15, 9]);
      b.add('label', 15, 9, { text: 'Vout' });
      b.add('nmos', 12, 12, { name: 'M2' });
      b.wire([10, 12], [8, 12]);
      b.add('label', 8, 12, { text: 'Vbias' });
      b.wire([12, 14], [12, 16]);
      b.wire([12, 15], [15, 15]);
      b.add('label', 15, 15, { text: 'Vx' });
      b.add('nmos', 12, 18, { name: 'M1' });
      b.wire([12, 20], [12, 22]);
      b.add('ground', 12, 22);

      b.wire([10, 18], [7, 18], [7, 21]);
      b.add('label', 8, 18, { text: 'Vin' });
      b.add('vsource', 7, 23, { name: 'V3', wave: sine(0.15, 1000, 2) });
      b.wire([7, 25], [7, 27]);
      b.add('ground', 7, 27);

      const path: [number, number][] = [
        [12, 4],
        [12, 8],
        [12, 16],
        [12, 22],
      ];
      b.ruler(path, 19, 2, 20, 0.25e-3, { name: 'Input peak' });
      b.ruler(path, 33, 2, 20, 0.75e-3, { name: 'Input trough' });
      b.ruler(path, 47, 2, 20, null, { name: 'Live' });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'diff-pair',
    title: 'Differential amplifier',
    group: 'BJT stages',
    blurb: 'A long-tailed pair: the tail holds the emitters together while a 10 mV input steers current between the halves.',
    build() {
      const b = new DocBuilder();
      // Supplies: Vcc = +12 V, Vee = −12 V
      b.add('vsource', 2, 6, { name: 'V1', wave: { type: 'dc', value: 12 } });
      b.add('label', 2, 2, { text: 'Vcc' });
      b.wire([2, 2], [2, 4]);
      b.wire([2, 8], [2, 10]);
      b.add('ground', 2, 10);
      b.add('vsource', 2, 19, { name: 'V2', wave: { type: 'dc', value: -12 } });
      b.add('label', 2, 14, { text: 'Vee' });
      b.wire([2, 14], [2, 17]);
      b.wire([2, 21], [2, 23]);
      b.add('ground', 2, 23);

      // Collector loads
      b.wire([12, 4], [12, 2], [18, 2], [18, 4]);
      b.add('label', 15, 2, { text: 'Vcc' });
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
      b.wire([12, 14], [12, 16], [18, 16], [18, 14]);
      b.add('label', 15, 16, { text: 'Vtail' });
      b.wire([15, 16], [15, 18]);
      b.add('resistor', 15, 20, { name: 'Rt', params: { r: 11e3 } });
      b.wire([15, 22], [15, 24]);
      b.add('label', 15, 24, { text: 'Vee', rot: 2 });

      // Inputs: a small sine on Q1's base, Q2's base grounded
      b.wire([10, 12], [6, 12], [6, 15]);
      b.add('label', 8, 12, { text: 'Vin' });
      b.add('vsource', 6, 17, { name: 'V3', wave: { type: 'sine', offset: 0, amplitude: 10e-3, freq: 1000, delay: 0, phase: 0 } });
      b.wire([6, 19], [6, 21]);
      b.add('ground', 6, 21);
      b.wire([20, 12], [22, 12], [22, 14]);
      b.add('ground', 22, 14);

      b.ruler(
        [
          [12, 4],
          [12, 10],
          [15, 16],
          [15, 22],
        ],
        27,
        2,
        20,
        null,
        { name: 'Left half' },
      );
      const out: [number, number][] = [
        [12, 10],
        [18, 10],
      ];
      b.ruler(out, 41, 2, 20, null, { name: 'Output (live)', scale: { min: 4.5, max: 9.5 } });
      b.ruler(out, 55, 2, 20, 0.25e-3, { name: 'Output at input peak', scale: { min: 4.5, max: 9.5 } });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'cmos-diff',
    title: 'CMOS differential pair',
    group: 'MOSFET stages',
    blurb: 'An NMOS pair on an M5 tail with a PMOS mirror load: M3 copies M1’s current to M4, so the single output gets both halves’ swing.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vdd', 10);
      rail(b, 2, 14, 'V2', 'Vbias', 2);

      // PMOS mirror: M3 is diode-connected
      b.wire([12, 4], [12, 2], [20, 2], [20, 4]);
      b.add('label', 16, 2, { text: 'Vdd' });
      b.add('pmos', 12, 6, { name: 'M3', rot: 2 });
      b.add('pmos', 20, 6, { name: 'M4', rot: 2, flip: true });
      b.wire([14, 6], [18, 6]);
      b.wire([12, 8], [12, 10]);
      b.wire([12, 9], [16, 9], [16, 6]);
      b.wire([20, 8], [20, 10]);
      b.wire([20, 9], [24, 9]);
      b.add('label', 24, 9, { text: 'Vout' });

      // The pair and its tail
      b.add('nmos', 12, 12, { name: 'M1' });
      b.add('nmos', 20, 12, { name: 'M2', flip: true });
      b.wire([12, 14], [12, 16], [20, 16], [20, 14]);
      b.add('label', 16, 16, { text: 'Vtail' });
      b.wire([16, 16], [16, 18]);
      b.add('nmos', 16, 20, { name: 'M5' });
      b.wire([14, 20], [12, 20]);
      b.add('label', 12, 20, { text: 'Vbias' });
      b.wire([16, 22], [16, 24]);
      b.add('ground', 16, 24);

      // Inputs: both gates at 3 V, with a 5 mV sine on M1's
      b.wire([10, 12], [7, 12], [7, 15]);
      b.add('label', 8, 12, { text: 'Vin+' });
      b.add('vsource', 7, 17, { name: 'V3', wave: sine(5e-3, 1000, 3) });
      b.wire([7, 19], [7, 21]);
      b.add('ground', 7, 21);
      b.wire([22, 12], [26, 12], [26, 15]);
      b.add('label', 24, 12, { text: 'Vin−' });
      b.add('vsource', 26, 17, { name: 'V4', wave: { type: 'dc', value: 3 } });
      b.wire([26, 19], [26, 21]);
      b.add('ground', 26, 21);

      b.ruler(
        [
          [12, 4],
          [12, 8],
          [16, 16],
          [16, 24],
        ],
        30,
        2,
        20,
        null,
        { name: 'Left half' },
      );
      const right: [number, number][] = [
        [20, 4],
        [20, 8],
        [16, 16],
        [16, 24],
      ];
      b.ruler(right, 44, 2, 20, null, { name: 'Right half (live)' });
      b.ruler(right, 58, 2, 20, 0.25e-3, { name: 'Right half at input peak' });
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'shunt',
    title: 'High-side current sense',
    group: 'Op-amp circuits',
    blurb: 'The shunt’s drop is tiny and floats near 12 V; a gain-of-20 difference amplifier brings it down to ground.',
    build() {
      const b = new DocBuilder();
      // 12 V bus through a 0.1 Ω shunt into the load
      b.add('vsource', 2, 10, { name: 'V1', wave: { type: 'dc', value: 12 } });
      b.wire([2, 12], [2, 14]);
      b.add('ground', 2, 14);
      b.wire([2, 8], [2, 4], [14, 4], [14, 7], [16, 7]);
      b.add('label', 5, 4, { text: 'Vbus' });
      b.add('resistor', 8, 6, { name: 'Rs', params: { r: 0.1 } });
      b.wire([8, 8], [8, 10], [12, 10], [14, 10], [14, 11], [16, 11]);
      b.add('label', 10, 10, { text: 'Vload' });
      b.wire([8, 10], [8, 12]);
      b.add('resistor', 8, 14, { name: 'Rload', params: { r: 24 } });
      b.wire([8, 16], [8, 18]);
      b.add('ground', 8, 18);
      // A load that steps between 0 and 1 A on top of the 0.5 A resistor
      b.wire([12, 10], [12, 12]);
      b.add('isource', 12, 14, {
        name: 'Iload',
        rot: 2,
        flip: true,
        wave: { type: 'pulse', v1: 0, v2: 1, delay: 1e-3, rise: 0.5e-3, fall: 0.5e-3, width: 2e-3, period: 5e-3 },
      });
      b.wire([12, 16], [12, 18]);
      b.add('ground', 12, 18);

      // Difference amplifier: Vsense = (Rf/R1)·(Vbus − Vload) = 20 × shunt drop
      b.add('opamp', 24, 8, { name: 'U1', rot: 2, flip: true, params: { vpos: 15, vneg: -15 } });
      b.add('resistor', 18, 7, { name: 'R2', rot: 3, params: { r: 1000 } });
      b.wire([20, 7], [22, 7]);
      b.add('resistor', 20, 5, { name: 'R3', params: { r: 20e3 } });
      b.wire([20, 3], [20, 1]);
      b.add('ground', 20, 1, { rot: 2 });
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
          [8, 18],
        ],
        33,
        1,
        17,
        null,
        { name: 'Bus → load' },
      );
      b.ruler(
        [
          [8, 4],
          [8, 8],
        ],
        47,
        1,
        17,
        null,
        { name: 'Shunt (zoomed)', scale: { min: 11.8, max: 12.02 } },
      );
      b.ruler(
        [
          [28, 8],
          [8, 18],
        ],
        61,
        1,
        17,
        null,
        { name: 'Sense output' },
      );
      b.doc.sim = { stopTime: 8e-3, steps: 1600, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'two-stage',
    title: 'Loaded vs buffered stage',
    group: 'Output & multi-stage',
    blurb: 'Two identical CE stages drive 1 kΩ. Loaded directly, A’s gain collapses to (Rc‖RL)/Re; B’s emitter follower keeps the full Rc/Re.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vcc', 12);
      b.add('label', 2, 14, { text: 'Vin' });
      b.wire([2, 14], [2, 16]);
      b.add('vsource', 2, 18, { name: 'V2', wave: sine(0.5, 1000) });
      b.wire([2, 20], [2, 22]);
      b.add('ground', 2, 22);

      // Stage A: the load hangs straight off the collector (AC-coupled to keep the bias)
      ceStage(b, 6, 'A', 'Q1');
      b.wire([19, 9], [21, 9]);
      b.add('capacitor', 23, 9, { name: 'CoA', rot: 3, params: { c: 10e-6 } });
      b.wire([25, 9], [28, 9], [28, 11]);
      b.add('label', 27, 9, { text: 'VoA' });
      b.add('resistor', 28, 13, { name: 'RLA', params: { r: 1000 } });
      b.wire([28, 15], [28, 17]);
      b.add('ground', 28, 17);

      // Stage B: an emitter follower between the collector and the load
      ceStage(b, 32, 'B', 'Q2');
      b.wire([45, 9], [47, 9], [47, 12], [49, 12]);
      b.add('label', 51, 2, { text: 'Vcc' });
      b.wire([51, 2], [51, 10]);
      b.add('npn', 51, 12, { name: 'Q3' });
      b.wire([51, 14], [51, 16]);
      b.wire([51, 15], [54, 15]);
      b.add('label', 54, 15, { text: 'VoB' });
      b.add('resistor', 51, 18, { name: 'RLB', params: { r: 1000 } });
      b.wire([51, 20], [51, 22]);
      b.add('ground', 51, 22);

      b.ruler(
        [
          [19, 4],
          [19, 8],
          [28, 11],
          [28, 17],
        ],
        58,
        2,
        20,
        null,
        { name: 'Stage A, loaded' },
      );
      b.ruler(
        [
          [45, 4],
          [45, 8],
          [51, 16],
          [51, 22],
        ],
        72,
        2,
        20,
        null,
        { name: 'Stage B, buffered' },
      );
      b.doc.probes = [
        { x: 28, y: 11 },
        { x: 51, y: 16 },
      ];
      b.doc.sim = { stopTime: 3e-3, steps: 1500, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
  {
    id: 'push-pull',
    title: 'Push-pull output stage',
    group: 'Output & multi-stage',
    blurb: 'Q1 pushes on the way up and Q2 pulls on the way down, but neither conducts while |Vin| < 0.6 V: the output stalls at every zero crossing.',
    build() {
      const b = new DocBuilder();
      rail(b, 2, 2, 'V1', 'Vcc', 12);
      rail(b, 2, 14, 'V2', 'Vee', -12);

      b.add('label', 18, 4, { text: 'Vcc' });
      b.wire([18, 4], [18, 6]);
      b.add('npn', 18, 8, { name: 'Q1' });
      b.wire([18, 10], [18, 14]);
      b.add('pnp', 18, 16, { name: 'Q2', rot: 2, flip: true });
      b.wire([18, 18], [18, 20]);
      b.add('label', 18, 20, { text: 'Vee', rot: 2 });
      b.wire([18, 12], [22, 12]);
      b.add('label', 20, 12, { text: 'Vout' });
      b.add('resistor', 22, 14, { name: 'RL', params: { r: 1000 } });
      b.wire([22, 16], [22, 18]);
      b.add('ground', 22, 18);

      b.wire([16, 8], [14, 8], [14, 16], [16, 16]);
      b.wire([14, 12], [6, 12], [6, 13]);
      b.add('label', 10, 12, { text: 'Vin' });
      b.add('vsource', 6, 15, { name: 'V3', wave: sine(5, 500) });
      b.wire([6, 17], [6, 19]);
      b.add('ground', 6, 19);

      const path: [number, number][] = [
        [14, 12],
        [18, 12],
        [22, 18],
      ];
      b.ruler(path, 26, 2, 18, 0.5e-3, { name: 'Input peak' });
      b.ruler(path, 40, 2, 18, 2.03e-3, { name: 'Near a zero crossing' });
      b.ruler(path, 54, 2, 18, null, { name: 'Live' });
      b.doc.sim = { stopTime: 4e-3, steps: 2000, start: 'dc', method: 'trap' };
      return b.doc;
    },
  },
];

/** The CE amplifier's bias network and stage, with Vin coupled in at x0 and the collector at x0 + 13. */
function ceStage(b: DocBuilder, x0: number, tag: string, q: string) {
  b.add('label', x0, 12, { text: 'Vin' });
  b.wire([x0, 12], [x0 + 1, 12]);
  b.add('capacitor', x0 + 3, 12, { name: `Ci${tag}`, rot: 3, params: { c: 10e-6 } });
  b.wire([x0 + 5, 12], [x0 + 11, 12]);
  const xb = x0 + 7;
  b.add('label', xb, 2, { text: 'Vcc' });
  b.wire([xb, 2], [xb, 4]);
  b.add('resistor', xb, 6, { name: `Rb1${tag}`, params: { r: 47e3 } });
  b.wire([xb, 8], [xb, 12]);
  b.wire([xb, 12], [xb, 14]);
  b.add('resistor', xb, 16, { name: `Rb2${tag}`, params: { r: 10e3 } });
  b.wire([xb, 18], [xb, 20]);
  b.add('ground', xb, 20);
  const xc = x0 + 13;
  b.add('label', xc, 2, { text: 'Vcc' });
  b.wire([xc, 2], [xc, 4]);
  b.add('resistor', xc, 6, { name: `Rc${tag}`, params: { r: 4700 } });
  b.wire([xc, 8], [xc, 10]);
  b.add('npn', xc, 12, { name: q });
  b.wire([xc, 14], [xc, 16]);
  b.add('resistor', xc, 18, { name: `Re${tag}`, params: { r: 1000 } });
  b.wire([xc, 20], [xc, 22]);
  b.add('ground', xc, 22);
}
