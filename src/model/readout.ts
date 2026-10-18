import type { SimResult } from '../sim/simulate';
import { KINDS } from './kinds';
import type { Netlist } from './netlist';
import { netVoltage } from './ruler';
import { transistorRegion } from './regions';
import type { Component } from './types';
import { formatEng } from './units';

export interface ReadoutLine {
  label: string;
  value: string;
}

export function pinCurrent(sim: SimResult | null, id: string, pin: number, k: number): number | undefined {
  const series = sim?.pinI.get(id)?.[pin];
  if (!series || series.length === 0) return undefined;
  return series[Math.min(k, series.length - 1)];
}

/** Voltages across and currents through a component at time index k. */
export function componentReadout(c: Component, nl: Netlist, sim: SimResult | null, k: number): ReadoutLine[] {
  const def = KINDS[c.kind];
  const nets = nl.pinNets.get(c.id);
  if (!nets || !sim || sim.times.length === 0) return [];
  const v = (pin: number) => netVoltage(nl, sim, nets[pin], k);
  const lines: ReadoutLine[] = [];
  if (c.kind === 'ground' || c.kind === 'label') {
    lines.push({ label: nl.nets[nets[0]].name, value: formatEng(v(0), 'V') });
    return lines;
  }
  if (def.pins.length === 2) {
    lines.push({ label: 'V across', value: formatEng(v(0) - v(1), 'V') });
    const i = pinCurrent(sim, c.id, 0, k);
    if (i !== undefined) lines.push({ label: `I (${def.pins[0].name} → ${def.pins[1].name})`, value: formatEng(i, 'A') });
    return lines;
  }
  const region = transistorRegion(c, nl, sim, k);
  if (region) lines.push({ label: 'Region', value: region.long });
  for (const [a, b] of def.spans) {
    lines.push({ label: `V${def.pins[a].name}${def.pins[b].name}`, value: formatEng(v(a) - v(b), 'V') });
  }
  def.pins.forEach((p, i) => {
    const cur = pinCurrent(sim, c.id, i, k);
    if (cur !== undefined && (c.kind !== 'opamp' || p.name === 'out')) {
      lines.push({ label: `I${p.name} (in)`, value: formatEng(cur, 'A') });
    }
  });
  return lines;
}
