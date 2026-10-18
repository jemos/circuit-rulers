// Current through each drawn wire segment, from the simulated pin currents.
//
// Each net's wires form a graph whose vertices are wire endpoints, T-junctions and pins.
// Pins inject current (minus the current into the device), and ground symbols and same-text
// labels connect through a virtual vertex. On a tree, KCL alone fixes every segment's
// current. Loops of ideal wire are indeterminate, so wires are treated as resistances
// proportional to their length, which reduces to the KCL answer on trees.

import { solveInPlace } from '../sim/linalg';
import type { SimResult } from '../sim/simulate';
import { onSegment, pinPositions } from './geometry';
import type { Netlist } from './netlist';
import { Doc, Pt, ptKey } from './types';

export interface WireSegment {
  wire: string;
  a: Pt;
  b: Pt;
}

export interface WireCurrents {
  segments: WireSegment[];
  /** Segment current a→b = Σ w · (current out of the net into pin `pin` of `id`), negated. */
  terms: { seg: number; id: string; pin: number; w: number }[];
}

// A ground or label symbol ties its pin to every other one with negligible resistance.
const SYMBOL_G = 1e3;

export function wireCurrents(doc: Pick<Doc, 'components' | 'wires'>, nl: Netlist): WireCurrents {
  const segments: WireSegment[] = [];
  const terms: WireCurrents['terms'] = [];
  const points = [...nl.pointNets.keys()].map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });

  // Per net: vertex keys, edges (segment index or -1 for a symbol link) and injecting pins.
  type NetGraph = {
    verts: Map<string, number>;
    edges: { u: number; v: number; g: number; seg: number }[];
    pins: { v: number; id: string; pin: number }[];
  };
  const graphs = new Map<number, NetGraph>();
  const graph = (net: number) => {
    let g = graphs.get(net);
    if (!g) graphs.set(net, (g = { verts: new Map(), edges: [], pins: [] }));
    return g;
  };
  const vert = (g: NetGraph, key: string) => {
    let i = g.verts.get(key);
    if (i === undefined) g.verts.set(key, (i = g.verts.size));
    return i;
  };

  for (const w of doc.wires) {
    const net = nl.wireNets.get(w.id);
    if (net === undefined || (w.a.x === w.b.x && w.a.y === w.b.y)) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const t = (p: Pt) => ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / len ** 2;
    const stops = [w.a, ...points.filter((p) => onSegment(p, w.a, w.b, false)).sort((p, q) => t(p) - t(q)), w.b];
    const g = graph(net);
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      const seg = segments.push({ wire: w.id, a, b }) - 1;
      g.edges.push({ u: vert(g, ptKey(a)), v: vert(g, ptKey(b)), g: 1 / Math.hypot(b.x - a.x, b.y - a.y), seg });
    }
  }

  for (const c of doc.components) {
    const nets = nl.pinNets.get(c.id);
    if (!nets) continue;
    pinPositions(c).forEach((p, pin) => {
      const g = graph(nets[pin]);
      const v = vert(g, ptKey(p));
      if (c.kind === 'ground') g.edges.push({ u: v, v: vert(g, 'gnd'), g: SYMBOL_G, seg: -1 });
      else if (c.kind === 'label') {
        const text = (c.text ?? '').trim();
        if (text) g.edges.push({ u: v, v: vert(g, `label:${text}`), g: SYMBOL_G, seg: -1 });
      } else g.pins.push({ v, id: c.id, pin });
    });
  }

  for (const g of graphs.values()) {
    if (!g.edges.some((e) => e.seg >= 0) || g.pins.length === 0) continue;
    const n = g.verts.size;
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const e of g.edges) {
      adj[e.u].push(e.v);
      adj[e.v].push(e.u);
    }
    // One reference vertex per connected piece; the rest are unknowns.
    const piece = new Array<number>(n).fill(-1);
    const col = new Array<number>(n).fill(-1);
    let m = 0;
    for (let s = 0; s < n; s++) {
      if (piece[s] >= 0) continue;
      piece[s] = s;
      const stack = [s];
      while (stack.length) {
        const u = stack.pop()!;
        for (const v of adj[u]) {
          if (piece[v] >= 0) continue;
          piece[v] = s;
          col[v] = m++;
          stack.push(v);
        }
      }
    }
    const L = new Float64Array(m * m);
    for (const e of g.edges) {
      const a = col[e.u];
      const b = col[e.v];
      if (a >= 0) L[a * m + a] += e.g;
      if (b >= 0) L[b * m + b] += e.g;
      if (a >= 0 && b >= 0) {
        L[a * m + b] -= e.g;
        L[b * m + a] -= e.g;
      }
    }
    // Potentials for a unit injection at each pin vertex, sunk at its piece's reference.
    const unit = new Map<number, Float64Array>();
    for (const { v } of g.pins) {
      if (unit.has(v) || col[v] < 0) continue;
      const phi = new Float64Array(m);
      phi[col[v]] = 1;
      solveInPlace(L.slice(), phi, m);
      unit.set(v, phi);
    }
    for (const { v, id, pin } of g.pins) {
      const phi = unit.get(v);
      if (!phi) continue;
      for (const e of g.edges) {
        if (e.seg < 0) continue;
        const w = e.g * ((col[e.u] >= 0 ? phi[col[e.u]] : 0) - (col[e.v] >= 0 ? phi[col[e.v]] : 0));
        if (Math.abs(w) > 1e-9) terms.push({ seg: e.seg, id, pin, w });
      }
    }
  }
  return { segments, terms };
}

/** Current a→b through each segment at time index k. */
export function segmentCurrents(wc: WireCurrents, sim: SimResult, k: number): Float64Array {
  const out = new Float64Array(wc.segments.length);
  for (const t of wc.terms) {
    const series = sim.pinI.get(t.id)?.[t.pin];
    if (series?.length) out[t.seg] -= t.w * series[Math.min(k, series.length - 1)];
  }
  return out;
}

/** Largest segment current magnitude over the whole run. */
export function maxSegmentCurrent(wc: WireCurrents, sim: SimResult): number {
  let max = 0;
  for (let k = 0; k < sim.times.length; k++) {
    for (const v of segmentCurrents(wc, sim, k)) max = Math.max(max, Math.abs(v));
  }
  return max;
}
