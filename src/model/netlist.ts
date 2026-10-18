// Turns the drawn schematic into nets and a simulator netlist.

import { ElementSpec } from '../sim/devices';
import { SimInput } from '../sim/simulate';
import { onSegment, pinPositions } from './geometry';
import { Component, Doc, Pt, ptKey, Wire } from './types';

export interface Net {
  index: number;
  name: string;
  isGround: boolean;
  /** Simulator node index, -1 for ground. */
  node: number;
}

export interface Netlist {
  nets: Net[];
  /** Net index for every pin of every component (by component id). */
  pinNets: Map<string, number[]>;
  /** Net index for every wire (by wire id). */
  wireNets: Map<string, number>;
  /** Net index of every connection point (pins and wire endpoints). */
  pointNets: Map<string, number>;
  /** Points where three or more connections meet (drawn as dots). */
  junctions: Pt[];
  /** Component pins with nothing else attached. */
  openPins: Pt[];
  sim: SimInput;
  warnings: string[];
}

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a);
    if (p === undefined) {
      this.parent.set(a, a);
      return a;
    }
    if (p === a) return a;
    p = this.find(p);
    this.parent.set(a, p);
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const GROUND_KEY = 'gnd';
const isGroundLabel = (text: string) => /^(gnd|0)$/i.test(text.trim());

export function buildNetlist(doc: Pick<Doc, 'components' | 'wires'>): Netlist {
  const uf = new UnionFind();
  const pinPos = new Map<string, Pt[]>();
  const connCount = new Map<string, number>();
  const bump = (p: Pt, n = 1) => connCount.set(ptKey(p), (connCount.get(ptKey(p)) ?? 0) + n);
  const points = new Map<string, Pt>();

  for (const c of doc.components) {
    const pins = pinPositions(c);
    pinPos.set(c.id, pins);
    for (const p of pins) {
      uf.find(ptKey(p));
      points.set(ptKey(p), p);
      bump(p);
    }
    if (c.kind === 'ground') uf.union(ptKey(pins[0]), GROUND_KEY);
    if (c.kind === 'label') {
      const text = (c.text ?? '').trim();
      if (text) uf.union(ptKey(pins[0]), isGroundLabel(text) ? GROUND_KEY : `label:${text}`);
    }
  }
  const wires = doc.wires.filter((w) => w.a.x !== w.b.x || w.a.y !== w.b.y);
  for (const w of wires) {
    uf.union(ptKey(w.a), ptKey(w.b));
    points.set(ptKey(w.a), w.a);
    points.set(ptKey(w.b), w.b);
    bump(w.a);
    bump(w.b);
  }
  // T-junctions: any connection point lying inside a wire joins that wire.
  for (const w of wires) {
    for (const [key, p] of points) {
      if (onSegment(p, w.a, w.b, false)) {
        uf.union(key, ptKey(w.a));
        bump(p, 2);
      }
    }
  }

  // Assign net indices. Ground first, then in drawing order for stable auto-names.
  const rootToNet = new Map<string, number>();
  const nets: Net[] = [];
  const netOf = (key: string): number => {
    const root = uf.find(key);
    let idx = rootToNet.get(root);
    if (idx === undefined) {
      idx = nets.length;
      rootToNet.set(root, idx);
      nets.push({ index: idx, name: '', isGround: false, node: -1 });
    }
    return idx;
  };
  const hasGround = doc.components.some(
    (c) => c.kind === 'ground' || (c.kind === 'label' && isGroundLabel(c.text ?? '')),
  );
  if (hasGround) {
    const g = netOf(GROUND_KEY);
    nets[g].isGround = true;
    nets[g].name = 'GND';
  }

  const pinNets = new Map<string, number[]>();
  for (const c of doc.components) pinNets.set(c.id, pinPos.get(c.id)!.map((p) => netOf(ptKey(p))));
  const wireNets = new Map<string, number>();
  for (const w of doc.wires) wireNets.set(w.id, netOf(ptKey(w.a)));
  const pointNets = new Map<string, number>();
  for (const key of points.keys()) pointNets.set(key, netOf(key));

  // Names: net labels win, then N1, N2, ...
  for (const c of doc.components) {
    if (c.kind !== 'label' || !c.text?.trim()) continue;
    const net = nets[pinNets.get(c.id)![0]];
    if (!net.isGround && !net.name) net.name = c.text.trim();
  }
  let auto = 1;
  const used = new Set(nets.map((n) => n.name));
  for (const n of nets) {
    if (n.name) continue;
    while (used.has(`N${auto}`)) auto++;
    n.name = `N${auto++}`;
  }

  const warnings: string[] = [];
  if (!hasGround && doc.components.length > 0) {
    warnings.push('No ground symbol: voltages are measured against an arbitrary reference.');
  }
  // Simulator nodes: every non-ground net. Without a ground, the first net becomes it.
  let nextNode = 0;
  const groundIdx = hasGround ? nets.findIndex((n) => n.isGround) : 0;
  for (const n of nets) n.node = n.index === groundIdx ? -1 : nextNode++;

  const elements: ElementSpec[] = [];
  for (const c of doc.components) {
    const spec = elementFor(c, pinNets.get(c.id)!.map((i) => nets[i].node));
    if (spec) elements.push(spec);
  }

  const junctions: Pt[] = [];
  for (const [key, count] of connCount) if (count >= 3) junctions.push(points.get(key)!);
  const openPins: Pt[] = [];
  for (const c of doc.components) {
    if (c.kind === 'label') continue;
    for (const p of pinPos.get(c.id)!) if (connCount.get(ptKey(p)) === 1) openPins.push(p);
  }

  return { nets, pinNets, wireNets, pointNets, junctions, openPins, sim: { nodeCount: nextNode, elements }, warnings };
}

function elementFor(c: Component, nodes: number[]): ElementSpec | null {
  const p = c.params;
  const id = c.id;
  const two = nodes as [number, number];
  const three = nodes as [number, number, number];
  switch (c.kind) {
    case 'resistor':
      return { kind: 'R', id, nodes: two, r: Math.max(p.r, 1e-6) };
    case 'capacitor':
      return { kind: 'C', id, nodes: two, c: p.c, ic: p.ic ?? 0 };
    case 'inductor':
      return { kind: 'L', id, nodes: two, l: p.l, ic: p.ic ?? 0 };
    case 'vsource':
      return c.wave ? { kind: 'V', id, nodes: two, wave: c.wave } : null;
    case 'isource':
      return c.wave ? { kind: 'I', id, nodes: two, wave: c.wave } : null;
    case 'diode':
      return { kind: 'D', id, nodes: two, is: p.is, n: p.n };
    case 'npn':
    case 'pnp':
      return { kind: 'Q', id, nodes: three, pol: c.kind === 'npn' ? 1 : -1, is: p.is, bf: p.bf, br: p.br };
    case 'nmos':
    case 'pmos':
      return {
        kind: 'M',
        id,
        nodes: three,
        pol: c.kind === 'nmos' ? 1 : -1,
        vth: Math.abs(p.vth),
        beta: p.beta,
        lambda: p.lambda,
      };
    case 'opamp':
      return { kind: 'OA', id, nodes: three, gain: p.gain, vpos: p.vpos, vneg: p.vneg };
    case 'ground':
    case 'label':
      return null;
  }
}

/** The net under a grid point: a connection point or anywhere along a wire. */
export function netAt(nl: Netlist, wires: Wire[], p: Pt): number | undefined {
  const direct = nl.pointNets.get(ptKey(p));
  if (direct !== undefined) return direct;
  for (const w of wires) if (onSegment(p, w.a, w.b, true)) return nl.wireNets.get(w.id);
  return undefined;
}
