// What a voltage ruler shows: the nodes the user clicked, in order, their voltages at a
// given time, and the voltage between each consecutive pair (usually one component).

import type { SimResult } from '../sim/simulate';
import { KINDS } from './kinds';
import { Netlist, netAt } from './netlist';
import { Doc, Ruler } from './types';

export const RULER_LABEL_W = 4.6; // node-label column, left of the spine
export const RULER_LANE_GAP = 0.9;
export const RULER_LANE_W = 3.4;

export function rulerWidth(lanes: number) {
  return RULER_LABEL_W + RULER_LANE_GAP + Math.max(1, lanes) * RULER_LANE_W;
}

export const NODE_COLORS = ['#7cc7ff', '#ff9e7a', '#8fe39b', '#f5d76e', '#c6a4ff', '#ff8fc8', '#62e0d0', '#ffbf69'];

export interface RulerNode {
  net: number;
  name: string;
  color: string;
  /** Position in the clicked path: the first and last nodes are the ruler's ends. */
  role: 'end' | 'mid';
}

export interface RulerSpan {
  key: string;
  /** Components connected directly between the two nodes, e.g. ["R1"] or ["Q1 CE"]. */
  names: string[];
  plus: number; // net index of the earlier node in the path
  minus: number; // net index of the next node in the path
}

export interface VoltRange {
  min: number;
  max: number;
}

/** Time-independent part of a ruler: which nets and spans it shows. */
export interface RulerLayout {
  nodes: RulerNode[];
  spans: RulerSpan[];
  /** The ruler's scale: its custom range, or the whole circuit's range over the run. */
  vmin: number;
  vmax: number;
  /** Lowest and highest voltage the path's own nodes reach during the run. */
  path: VoltRange;
}

export type RulerLayoutResult = { ok: true; layout: RulerLayout } | { ok: false; error: string };

export function netVoltage(nl: Netlist, sim: SimResult | null, net: number, k: number): number {
  const node = nl.nets[net]?.node ?? -1;
  if (node < 0 || !sim || sim.times.length === 0) return 0;
  const series = sim.nodeV[node];
  return series[Math.min(Math.max(k, 0), series.length - 1)];
}

const rangeCache = new WeakMap<SimResult, VoltRange>();

/** Lowest and highest node voltage anywhere in the circuit over the whole run (GND included). */
export function circuitRange(sim: SimResult | null): VoltRange {
  if (!sim || sim.times.length === 0) return { min: 0, max: 1 };
  let r = rangeCache.get(sim);
  if (!r) {
    let min = 0;
    let max = 0;
    for (const series of sim.nodeV) {
      for (const v of series) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (max - min < 1e-9) max = min + 1;
    r = { min, max };
    rangeCache.set(sim, r);
  }
  return r;
}

/** Names of the components (or component pin pairs) connected directly between nets a and b. */
export function componentsBetween(doc: Doc, nl: Netlist, a: number, b: number): string[] {
  const names: string[] = [];
  for (const c of doc.components) {
    const def = KINDS[c.kind];
    const nets = nl.pinNets.get(c.id);
    if (!nets) continue;
    for (const [pi, mi] of def.spans) {
      const x = nets[pi];
      const y = nets[mi];
      if ((x === a && y === b) || (x === b && y === a)) {
        names.push(def.pins.length > 2 ? `${c.name} ${def.pins[pi].name}${def.pins[mi].name}` : c.name);
      }
    }
  }
  return names;
}

export function layoutRuler(ruler: Ruler, doc: Doc, nl: Netlist, sim: SimResult | null): RulerLayoutResult {
  const nets: number[] = [];
  for (let i = 0; i < ruler.path.length; i++) {
    const net = netAt(nl, doc.wires, ruler.path[i]);
    if (net === undefined) return { ok: false, error: `Node ${i + 1} of the path is no longer on any wire or pin.` };
    if (nets.includes(net)) return { ok: false, error: `${nl.nets[net].name} appears twice in the path.` };
    nets.push(net);
  }
  if (nets.length < 2) return { ok: false, error: 'A ruler needs at least two nodes.' };

  const nodes: RulerNode[] = nets.map((net, i) => ({
    net,
    name: nl.nets[net].name,
    color: NODE_COLORS[i % NODE_COLORS.length],
    role: i === 0 || i === nets.length - 1 ? 'end' : 'mid',
  }));
  const spans: RulerSpan[] = [];
  for (let i = 1; i < nets.length; i++) {
    spans.push({ key: `${i}`, names: componentsBetween(doc, nl, nets[i - 1], nets[i]), plus: nets[i - 1], minus: nets[i] });
  }

  const path = { min: Infinity, max: -Infinity };
  const steps = sim?.times.length ?? 0;
  for (const net of nets) {
    for (let k = 0; k < Math.max(steps, 1); k++) {
      const v = netVoltage(nl, sim, net, k);
      if (v < path.min) path.min = v;
      if (v > path.max) path.max = v;
    }
  }
  const scale = ruler.scale && ruler.scale.max > ruler.scale.min ? ruler.scale : circuitRange(sim);
  return { ok: true, layout: { nodes, spans, vmin: scale.min, vmax: scale.max, path } };
}

export interface PlacedSpan extends RulerSpan {
  hi: number; // voltage of the upper end
  lo: number;
  dv: number; // V(plus) − V(minus)
  lane: number;
}

/** Voltages at time index k, with spans packed into non-overlapping lanes. */
export function rulerAt(layout: RulerLayout, nl: Netlist, sim: SimResult | null, k: number) {
  const v = new Map(layout.nodes.map((n) => [n.net, netVoltage(nl, sim, n.net, k)]));
  const eps = (layout.vmax - layout.vmin) * 1e-6;
  const lanes: { lo: number; hi: number }[][] = [];
  const spans: PlacedSpan[] = layout.spans.map((s) => {
    const a = v.get(s.plus)!;
    const b = v.get(s.minus)!;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    let lane = 0;
    while (lanes[lane]?.some((iv) => lo < iv.hi - eps && hi > iv.lo + eps)) lane++;
    (lanes[lane] ??= []).push({ lo, hi });
    return { ...s, lo, hi, dv: a - b, lane };
  });
  return { voltages: v, spans, laneCount: lanes.length };
}

/** Most lanes the ruler needs at any time, so its width stays put while scrubbing. */
export function maxLanes(layout: RulerLayout, nl: Netlist, sim: SimResult | null): number {
  const n = sim?.times.length ?? 0;
  const samples = Math.max(1, Math.min(n, 120));
  let lanes = 1;
  for (let s = 0; s < samples; s++) {
    const k = samples > 1 ? Math.round((s * (n - 1)) / (samples - 1)) : 0;
    lanes = Math.max(lanes, rulerAt(layout, nl, sim, k).laneCount);
  }
  return lanes;
}

/** Lay rulers out left to right, starting where the first one is, without overlaps. */
export function arrangeRulers(doc: Doc, nl: Netlist, sim: SimResult | null, gap = 3) {
  let x = doc.rulers[0]?.x ?? 0;
  for (const r of doc.rulers) {
    const res = layoutRuler(r, doc, nl, sim);
    r.x = x;
    x += rulerWidth(res.ok ? maxLanes(res.layout, nl, sim) : 1) + gap;
  }
}
