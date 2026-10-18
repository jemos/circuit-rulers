// Auxiliary plot traces: nodes picked with the probe tool.

import { Netlist, netAt } from './netlist';
import { Doc, Pt } from './types';

/** The probed nets in order, each once. Probes off any net, or on the reference, are skipped. */
export function probeNets(doc: Pick<Doc, 'probes' | 'wires'>, nl: Netlist): number[] {
  const out: number[] = [];
  for (const p of doc.probes) {
    const net = netAt(nl, doc.wires, p);
    if (net !== undefined && nl.nets[net].node >= 0 && !out.includes(net)) out.push(net);
  }
  return out;
}

/** Probe the net under `p`, or stop probing it if it already is. */
export function toggleProbe(d: Doc, nl: Netlist, p: Pt) {
  const net = netAt(nl, d.wires, p);
  if (net === undefined) return;
  const rest = d.probes.filter((q) => netAt(nl, d.wires, q) !== net);
  d.probes = rest.length < d.probes.length ? rest : [...rest, p];
}

/** A connection point on `net`, to stand for it as a probe. */
export function netPoint(nl: Netlist, net: number): Pt | undefined {
  for (const [key, n] of nl.pointNets) {
    if (n !== net) continue;
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }
  return undefined;
}
