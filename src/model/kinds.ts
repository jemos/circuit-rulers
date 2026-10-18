// Static description of each component kind: pins, defaults and editable fields.

import { defaultWaveform, Waveform } from '../sim/waveforms';
import { Component, ComponentKind, Pt } from './types';
import { formatShort } from './units';

export interface PinDef extends Pt {
  name: string;
}

export interface ParamField {
  key: string;
  label: string;
  unit: string;
  min?: number; // exclusive lower bound
}

export interface KindDef {
  kind: ComponentKind;
  title: string;
  prefix: string; // name prefix: R1, C2, Q3...
  pins: PinDef[];
  params: Record<string, number>;
  fields: ParamField[];
  /** Local anchor for the name/value label. */
  labelAt: Pt;
  /** Pin pairs whose voltage difference rulers can show, as [plus, minus] pin indices. */
  spans: [number, number][];
}

const twoPin: PinDef[] = [
  { name: '+', x: 0, y: -2 },
  { name: '−', x: 0, y: 2 },
];
const bjtPins: PinDef[] = [
  { name: 'C', x: 0, y: -2 },
  { name: 'B', x: -2, y: 0 },
  { name: 'E', x: 0, y: 2 },
];
const mosPins: PinDef[] = [
  { name: 'D', x: 0, y: -2 },
  { name: 'G', x: -2, y: 0 },
  { name: 'S', x: 0, y: 2 },
];

const bjtFields: ParamField[] = [
  { key: 'bf', label: 'β (forward gain)', unit: '', min: 0 },
  { key: 'br', label: 'β reverse', unit: '', min: 0 },
  { key: 'is', label: 'Saturation current', unit: 'A', min: 0 },
];
const mosFields: ParamField[] = [
  { key: 'vth', label: '|Vth| threshold', unit: 'V' },
  { key: 'beta', label: 'β = k′·W/L', unit: 'A/V²', min: 0 },
  { key: 'lambda', label: 'λ (channel-length mod.)', unit: '1/V' },
];

export const KINDS: Record<ComponentKind, KindDef> = {
  resistor: {
    kind: 'resistor',
    title: 'Resistor',
    prefix: 'R',
    pins: twoPin,
    params: { r: 1000 },
    fields: [{ key: 'r', label: 'Resistance', unit: 'Ω', min: 0 }],
    labelAt: { x: 0.8, y: 0 },
    spans: [[0, 1]],
  },
  capacitor: {
    kind: 'capacitor',
    title: 'Capacitor',
    prefix: 'C',
    pins: twoPin,
    params: { c: 1e-6, ic: 0 },
    fields: [
      { key: 'c', label: 'Capacitance', unit: 'F', min: 0 },
      { key: 'ic', label: 'Initial voltage', unit: 'V' },
    ],
    labelAt: { x: 0.9, y: 0 },
    spans: [[0, 1]],
  },
  inductor: {
    kind: 'inductor',
    title: 'Inductor',
    prefix: 'L',
    pins: twoPin,
    params: { l: 1e-3, ic: 0 },
    fields: [
      { key: 'l', label: 'Inductance', unit: 'H', min: 0 },
      { key: 'ic', label: 'Initial current', unit: 'A' },
    ],
    labelAt: { x: 0.8, y: 0 },
    spans: [[0, 1]],
  },
  vsource: {
    kind: 'vsource',
    title: 'Voltage source',
    prefix: 'V',
    pins: twoPin,
    params: {},
    fields: [],
    labelAt: { x: 1.1, y: 0 },
    spans: [[0, 1]],
  },
  isource: {
    kind: 'isource',
    title: 'Current source',
    prefix: 'I',
    pins: twoPin,
    params: {},
    fields: [],
    labelAt: { x: 1.1, y: 0 },
    spans: [[0, 1]],
  },
  diode: {
    kind: 'diode',
    title: 'Diode',
    prefix: 'D',
    pins: [
      { name: 'A', x: 0, y: -2 },
      { name: 'K', x: 0, y: 2 },
    ],
    params: { is: 1e-14, n: 1 },
    fields: [
      { key: 'is', label: 'Saturation current', unit: 'A', min: 0 },
      { key: 'n', label: 'Emission coefficient', unit: '', min: 0 },
    ],
    labelAt: { x: 0.8, y: 0 },
    spans: [[0, 1]],
  },
  npn: {
    kind: 'npn',
    title: 'NPN transistor',
    prefix: 'Q',
    pins: bjtPins,
    params: { bf: 100, br: 1, is: 1e-14 },
    fields: bjtFields,
    labelAt: { x: 0.6, y: 0 },
    spans: [
      [0, 2],
      [1, 2],
    ],
  },
  pnp: {
    kind: 'pnp',
    title: 'PNP transistor',
    prefix: 'Q',
    pins: bjtPins,
    params: { bf: 100, br: 1, is: 1e-14 },
    fields: bjtFields,
    labelAt: { x: 0.6, y: 0 },
    spans: [
      [2, 0],
      [2, 1],
    ],
  },
  nmos: {
    kind: 'nmos',
    title: 'N-channel MOSFET',
    prefix: 'M',
    pins: mosPins,
    params: { vth: 1, beta: 1e-3, lambda: 0.01 },
    fields: mosFields,
    labelAt: { x: 0.6, y: 0 },
    spans: [
      [0, 2],
      [1, 2],
    ],
  },
  pmos: {
    kind: 'pmos',
    title: 'P-channel MOSFET',
    prefix: 'M',
    pins: mosPins,
    params: { vth: 1, beta: 1e-3, lambda: 0.01 },
    fields: mosFields,
    labelAt: { x: 0.6, y: 0 },
    spans: [
      [2, 0],
      [2, 1],
    ],
  },
  opamp: {
    kind: 'opamp',
    title: 'Op-amp',
    prefix: 'U',
    pins: [
      { name: '−', x: -2, y: -1 },
      { name: '+', x: -2, y: 1 },
      { name: 'out', x: 2, y: 0 },
    ],
    params: { gain: 1e5, vpos: 15, vneg: -15 },
    fields: [
      { key: 'gain', label: 'Open-loop gain', unit: '', min: 0 },
      { key: 'vpos', label: 'Positive rail', unit: 'V' },
      { key: 'vneg', label: 'Negative rail', unit: 'V' },
    ],
    labelAt: { x: 0, y: -1.9 },
    spans: [[1, 0]],
  },
  ground: {
    kind: 'ground',
    title: 'Ground',
    prefix: 'GND',
    pins: [{ name: 'gnd', x: 0, y: 0 }],
    params: {},
    fields: [],
    labelAt: { x: 0, y: 0 },
    spans: [],
  },
  label: {
    kind: 'label',
    title: 'Net label',
    prefix: 'L',
    pins: [{ name: 'net', x: 0, y: 0 }],
    params: {},
    fields: [],
    labelAt: { x: 0, y: -0.5 },
    spans: [],
  },
};

/** Kinds offered in the toolbar, in order. */
export const PALETTE: ComponentKind[] = [
  'resistor',
  'capacitor',
  'inductor',
  'vsource',
  'isource',
  'diode',
  'npn',
  'pnp',
  'nmos',
  'pmos',
  'opamp',
  'ground',
  'label',
];

export function newComponent(kind: ComponentKind, id: string, name: string, x: number, y: number): Component {
  const def = KINDS[kind];
  const c: Component = { id, kind, name, x, y, rot: 0, flip: false, params: { ...def.params } };
  if (kind === 'vsource') c.wave = defaultWaveform('dc', 5);
  if (kind === 'isource') c.wave = defaultWaveform('dc', 1e-3);
  if (kind === 'label') c.text = 'Vdd';
  return c;
}

export function waveText(w: Waveform, unit: string): string {
  const f = (v: number) => formatShort(v) + unit;
  switch (w.type) {
    case 'dc':
      return f(w.value);
    case 'step':
      return `step ${formatShort(w.v1)}→${f(w.v2)}`;
    case 'pulse':
      return `pulse ${formatShort(w.v1)}/${f(w.v2)}`;
    case 'sine':
      return `sin ${f(w.amplitude)} ${formatShort(w.freq)}Hz`;
  }
}

/** Short value text shown next to the symbol. */
export function valueText(c: Component): string {
  const p = c.params;
  switch (c.kind) {
    case 'resistor':
      return formatShort(p.r) + 'Ω';
    case 'capacitor':
      return formatShort(p.c) + 'F';
    case 'inductor':
      return formatShort(p.l) + 'H';
    case 'vsource':
      return c.wave ? waveText(c.wave, 'V') : '';
    case 'isource':
      return c.wave ? waveText(c.wave, 'A') : '';
    case 'npn':
    case 'pnp':
      return `β=${formatShort(p.bf)}`;
    case 'nmos':
    case 'pmos':
      return `Vth=${formatShort(p.vth)}V`;
    default:
      return '';
  }
}
