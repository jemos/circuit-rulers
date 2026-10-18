// Transistor operating regions at a point in time, from textbook terminal-voltage rules.

import type { SimResult } from '../sim/simulate';
import type { Netlist } from './netlist';
import { netVoltage } from './ruler';
import type { Component } from './types';
import { formatEng } from './units';

/** What the region means for the circuit, shared by BJTs and MOSFETs. */
export type RegionRole = 'amplifying' | 'switch-on' | 'off' | 'reverse';

export interface Region {
  short: string; // badge text, e.g. "active"
  long: string; // e.g. "Forward active"
  role: RegionRole;
  /** The terminal voltages and the rule that decided the region. */
  why: string;
}

/** A BJT junction counts as forward biased above these voltages. */
export const BJT_BE_ON = 0.5;
export const BJT_BC_ON = 0.4;

const v = (x: number) => formatEng(x, 'V');

export function bjtRegion(vbe: number, vbc: number, pnp: boolean): Region {
  const be = pnp ? 'EB' : 'BE';
  const bc = pnp ? 'CB' : 'BC';
  const beOn = vbe >= BJT_BE_ON;
  const bcOn = vbc >= BJT_BC_ON;
  const vce = vbe - vbc;
  const ce = pnp ? 'EC' : 'CE';
  const facts = `V${be} = ${v(vbe)} ${beOn ? '≥' : '<'} ${BJT_BE_ON} V, V${bc} = ${v(vbc)} ${bcOn ? '≥' : '<'} ${BJT_BC_ON} V`;
  if (beOn && !bcOn) {
    return { short: 'active', long: 'Forward active', role: 'amplifying', why: `${facts} (V${ce} = ${v(vce)})` };
  }
  if (beOn && bcOn) {
    return { short: 'saturation', long: 'Saturation', role: 'switch-on', why: `${facts}: both junctions on, V${ce} = ${v(vce)}` };
  }
  if (!beOn && bcOn) return { short: 'reverse', long: 'Reverse active', role: 'reverse', why: facts };
  return { short: 'cutoff', long: 'Cutoff', role: 'off', why: facts };
}

export function mosRegion(vgs: number, vds: number, vth: number, pmos: boolean): Region {
  const g = pmos ? 'SG' : 'GS';
  const d = pmos ? 'SD' : 'DS';
  // With vds < 0 the drain and source swap roles; measure from the lower terminal.
  const swapped = vds < 0;
  const vgsEff = swapped ? vgs - vds : vgs;
  const vdsEff = Math.abs(vds);
  const vov = vgsEff - vth;
  const note = swapped ? ' (drain and source swapped)' : '';
  if (vov <= 0) {
    return { short: 'cutoff', long: 'Cutoff', role: 'off', why: `V${g} = ${v(vgsEff)} ≤ Vth = ${v(vth)}${note}` };
  }
  if (vdsEff < vov) {
    return {
      short: 'triode',
      long: 'Triode (linear)',
      role: 'switch-on',
      why: `V${d} = ${v(vdsEff)} < V${g} − Vth = ${v(vov)}${note}`,
    };
  }
  return {
    short: 'saturation',
    long: 'Saturation',
    role: 'amplifying',
    why: `V${d} = ${v(vdsEff)} ≥ V${g} − Vth = ${v(vov)}${note}`,
  };
}

/** Region of a transistor at time index k, or null for other parts / no simulation. */
export function transistorRegion(c: Component, nl: Netlist, sim: SimResult | null, k: number): Region | null {
  if (!sim || sim.times.length === 0) return null;
  const nets = nl.pinNets.get(c.id);
  if (!nets) return null;
  const V = (pin: number) => netVoltage(nl, sim, nets[pin], k);
  switch (c.kind) {
    case 'npn':
    case 'pnp': {
      const p = c.kind === 'npn' ? 1 : -1;
      const [vc, vb, ve] = [V(0), V(1), V(2)];
      return bjtRegion(p * (vb - ve), p * (vb - vc), p < 0);
    }
    case 'nmos':
    case 'pmos': {
      const p = c.kind === 'nmos' ? 1 : -1;
      const [vd, vg, vs] = [V(0), V(1), V(2)];
      return mosRegion(p * (vg - vs), p * (vd - vs), Math.abs(c.params.vth), p < 0);
    }
    default:
      return null;
  }
}
