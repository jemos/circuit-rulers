// Device models and their MNA stamps.
//
// Conventions:
//  - Node index -1 is ground. Unknown vector x = [node voltages..., branch currents...].
//  - Row k of A·x = b is KCL at node k: Σ(currents leaving node k into devices) = b[k].
//  - `pinCurrents` reports the current flowing INTO the device at each pin.

import { Waveform, waveformAt } from './waveforms';

export const VT = 0.025852; // thermal voltage at 300 K
export const GMIN = 1e-12;

export type ElementSpec =
  | { kind: 'R'; id: string; nodes: [number, number]; r: number }
  | { kind: 'C'; id: string; nodes: [number, number]; c: number; ic: number }
  | { kind: 'L'; id: string; nodes: [number, number]; l: number; ic: number }
  | { kind: 'V'; id: string; nodes: [number, number]; wave: Waveform }
  | { kind: 'I'; id: string; nodes: [number, number]; wave: Waveform }
  | { kind: 'D'; id: string; nodes: [number, number]; is: number; n: number }
  | { kind: 'Q'; id: string; nodes: [number, number, number]; pol: 1 | -1; is: number; bf: number; br: number }
  | { kind: 'M'; id: string; nodes: [number, number, number]; pol: 1 | -1; vth: number; beta: number; lambda: number }
  | { kind: 'OA'; id: string; nodes: [number, number, number]; gain: number; vpos: number; vneg: number };

export type AnalysisMode =
  | { kind: 'dc' } // operating point: capacitors open, inductors shorted
  | { kind: 'ic' } // t = 0 with explicit initial conditions (capacitor voltages, inductor currents)
  | { kind: 'tran'; h: number; method: 'be' | 'trap' };

export class StampContext {
  n: number; // matrix size
  A: Float64Array;
  b: Float64Array;
  x: Float64Array; // current Newton iterate
  t = 0;
  mode: AnalysisMode = { kind: 'dc' };
  sourceScale = 1;
  /** Set by nonlinear devices when they had to limit their operating point this iteration. */
  limited = false;

  constructor(n: number) {
    this.n = n;
    this.A = new Float64Array(n * n);
    this.b = new Float64Array(n);
    this.x = new Float64Array(n);
  }

  clear() {
    this.A.fill(0);
    this.b.fill(0);
    this.limited = false;
  }

  v(node: number): number {
    return node < 0 ? 0 : this.x[node];
  }

  addA(i: number, j: number, val: number) {
    if (i >= 0 && j >= 0) this.A[i * this.n + j] += val;
  }

  addB(i: number, val: number) {
    if (i >= 0) this.b[i] += val;
  }

  conductance(p: number, n: number, g: number) {
    this.addA(p, p, g);
    this.addA(n, n, g);
    this.addA(p, n, -g);
    this.addA(n, p, -g);
  }

  /** Current source pushing `i` amps from node p, through the source, out into node n. */
  current(p: number, n: number, i: number) {
    this.addB(p, -i);
    this.addB(n, i);
  }
}

export interface Device {
  readonly spec: ElementSpec;
  /** Number of extra branch-current unknowns this device needs. */
  readonly branchCount: number;
  branch: number; // index of first branch unknown (assigned by the circuit)
  readonly nonlinear: boolean;
  stamp(ctx: StampContext): void;
  /** Called once a time point (or the initial operating point) has converged. */
  accept(ctx: StampContext): void;
  pinCurrents(ctx: StampContext): number[];
}

// ---------------------------------------------------------------------------
// Linear elements

class Resistor implements Device {
  branchCount = 0;
  branch = -1;
  nonlinear = false;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'R' }>) {}
  stamp(ctx: StampContext) {
    const [p, n] = this.spec.nodes;
    ctx.conductance(p, n, 1 / this.spec.r);
  }
  accept() {}
  pinCurrents(ctx: StampContext) {
    const [p, n] = this.spec.nodes;
    const i = (ctx.v(p) - ctx.v(n)) / this.spec.r;
    return [i, -i];
  }
}

const IC_CONDUCTANCE = 1e6; // Norton stand-in for a capacitor pinned to its initial voltage

class Capacitor implements Device {
  branchCount = 0;
  branch = -1;
  nonlinear = false;
  vPrev = 0;
  iPrev = 0;
  iNow = 0;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'C' }>) {}

  private companion(ctx: StampContext): [number, number] | null {
    const m = ctx.mode;
    if (m.kind === 'dc') return null;
    if (m.kind === 'ic') return [IC_CONDUCTANCE, IC_CONDUCTANCE * this.spec.ic];
    if (m.method === 'be') {
      const g = this.spec.c / m.h;
      return [g, g * this.vPrev];
    }
    const g = (2 * this.spec.c) / m.h;
    return [g, g * this.vPrev + this.iPrev];
  }

  stamp(ctx: StampContext) {
    const c = this.companion(ctx);
    if (!c) return;
    const [p, n] = this.spec.nodes;
    ctx.conductance(p, n, c[0]);
    ctx.current(n, p, c[1]); // i = g·v − Ieq
  }

  private currentNow(ctx: StampContext): number {
    const c = this.companion(ctx);
    if (!c || ctx.mode.kind === 'ic') return 0;
    const [p, n] = this.spec.nodes;
    return c[0] * (ctx.v(p) - ctx.v(n)) - c[1];
  }

  accept(ctx: StampContext) {
    const [p, n] = this.spec.nodes;
    this.iNow = this.currentNow(ctx);
    this.vPrev = ctx.v(p) - ctx.v(n);
    this.iPrev = this.iNow;
  }

  pinCurrents() {
    return [this.iNow, -this.iNow];
  }
}

class Inductor implements Device {
  branchCount = 1;
  branch = -1;
  nonlinear = false;
  vPrev = 0;
  iPrev = 0;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'L' }>) {}

  stamp(ctx: StampContext) {
    const [p, n] = this.spec.nodes;
    const k = this.branch;
    ctx.addA(p, k, 1);
    ctx.addA(n, k, -1);
    const m = ctx.mode;
    if (m.kind === 'ic') {
      ctx.addA(k, k, 1);
      ctx.addB(k, this.spec.ic);
      return;
    }
    ctx.addA(k, p, 1);
    ctx.addA(k, n, -1);
    if (m.kind === 'dc') return;
    if (m.method === 'be') {
      const r = this.spec.l / m.h;
      ctx.addA(k, k, -r);
      ctx.addB(k, -r * this.iPrev);
    } else {
      const r = (2 * this.spec.l) / m.h;
      ctx.addA(k, k, -r);
      ctx.addB(k, -r * this.iPrev - this.vPrev);
    }
  }

  accept(ctx: StampContext) {
    const [p, n] = this.spec.nodes;
    this.vPrev = ctx.v(p) - ctx.v(n);
    this.iPrev = ctx.x[this.branch];
  }

  pinCurrents(ctx: StampContext) {
    const i = ctx.x[this.branch];
    return [i, -i];
  }
}

class VoltageSource implements Device {
  branchCount = 1;
  branch = -1;
  nonlinear = false;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'V' }>) {}
  stamp(ctx: StampContext) {
    const [p, n] = this.spec.nodes;
    const k = this.branch;
    ctx.addA(p, k, 1);
    ctx.addA(n, k, -1);
    ctx.addA(k, p, 1);
    ctx.addA(k, n, -1);
    ctx.addB(k, ctx.sourceScale * waveformAt(this.spec.wave, ctx.t));
  }
  accept() {}
  pinCurrents(ctx: StampContext) {
    const i = ctx.x[this.branch];
    return [i, -i];
  }
}

/** Current source: pushes current out of its first (+) pin into the circuit. */
class CurrentSource implements Device {
  branchCount = 0;
  branch = -1;
  nonlinear = false;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'I' }>) {}
  private value(ctx: StampContext) {
    return ctx.sourceScale * waveformAt(this.spec.wave, ctx.t);
  }
  stamp(ctx: StampContext) {
    const [p, n] = this.spec.nodes;
    ctx.current(n, p, this.value(ctx));
  }
  accept() {}
  pinCurrents(ctx: StampContext) {
    const i = this.value(ctx);
    return [-i, i];
  }
}

// ---------------------------------------------------------------------------
// Nonlinear helpers

/** SPICE's pn-junction voltage limiting, keeps exp() from exploding between Newton steps. */
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): [number, boolean] {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return [arg > 0 ? vold + vt * Math.log(arg) : vcrit, true];
    }
    return [vt * Math.log(vnew / vt), true];
  }
  return [vnew, false];
}

function vcrit(is: number, vt: number) {
  return vt * Math.log(vt / (Math.SQRT2 * is));
}

const EXP_MAX = 80;
/** exp(x) that continues linearly past EXP_MAX instead of overflowing. Returns [value, derivative]. */
function safeExp(x: number): [number, number] {
  if (x < EXP_MAX) {
    const e = Math.exp(x);
    return [e, e];
  }
  const e = Math.exp(EXP_MAX);
  return [e * (1 + x - EXP_MAX), e];
}

/**
 * Stamp a device whose terminal currents depend on a few "controlling" voltages, each
 * the difference of two node voltages: vc_m = V(pos_m) − V(neg_m).
 * `i[k]` is the current into terminal node `terms[k]`, `g[k][m]` = ∂i[k]/∂vc_m, all
 * evaluated at the (possibly limited) controlling voltages `vc`.
 */
function stampLinearized(
  ctx: StampContext,
  terms: number[],
  ctrl: [number, number][],
  vc: number[],
  i: number[],
  g: number[][],
) {
  for (let k = 0; k < terms.length; k++) {
    const row = terms[k];
    if (row < 0) continue;
    let ieq = i[k];
    for (let m = 0; m < ctrl.length; m++) {
      const gm = g[k][m];
      if (gm === 0) continue;
      ctx.addA(row, ctrl[m][0], gm);
      ctx.addA(row, ctrl[m][1], -gm);
      ieq -= gm * vc[m];
    }
    ctx.addB(row, -ieq);
  }
}

// ---------------------------------------------------------------------------
// Diode (Shockley)

class Diode implements Device {
  branchCount = 0;
  branch = -1;
  nonlinear = true;
  private vdOld = 0;
  private readonly nvt: number;
  private readonly vcrit: number;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'D' }>) {
    this.nvt = spec.n * VT;
    this.vcrit = vcrit(spec.is, this.nvt);
  }

  private eval(vd: number): [number, number] {
    const [e, de] = safeExp(vd / this.nvt);
    const id = this.spec.is * (e - 1) + GMIN * vd;
    const gd = (this.spec.is * de) / this.nvt + GMIN;
    return [id, gd];
  }

  stamp(ctx: StampContext) {
    const [a, k] = this.spec.nodes;
    let vd = ctx.v(a) - ctx.v(k);
    let lim: boolean;
    [vd, lim] = pnjlim(vd, this.vdOld, this.nvt, this.vcrit);
    if (lim) ctx.limited = true;
    this.vdOld = vd;
    const [id, gd] = this.eval(vd);
    stampLinearized(ctx, [a, k], [[a, k]], [vd], [id, -id], [[gd], [-gd]]);
  }

  accept(ctx: StampContext) {
    this.vdOld = ctx.v(this.spec.nodes[0]) - ctx.v(this.spec.nodes[1]);
  }

  pinCurrents(ctx: StampContext) {
    const [id] = this.eval(ctx.v(this.spec.nodes[0]) - ctx.v(this.spec.nodes[1]));
    return [id, -id];
  }
}

// ---------------------------------------------------------------------------
// BJT (Ebers–Moll transport model). Pins: [collector, base, emitter].

class Bjt implements Device {
  branchCount = 0;
  branch = -1;
  nonlinear = true;
  private vbeOld = 0;
  private vbcOld = 0;
  private readonly vcrit: number;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'Q' }>) {
    this.vcrit = vcrit(spec.is, VT);
  }

  /** Currents into [C, B, E] in the device's own polarity, plus ∂/∂[vbe, vbc]. */
  private eval(vbe: number, vbc: number): { i: number[]; g: number[][] } {
    const { is, bf, br } = this.spec;
    const [ebe, debe] = safeExp(vbe / VT);
    const [ebc, debc] = safeExp(vbc / VT);
    const iF = is * (ebe - 1);
    const iR = is * (ebc - 1);
    const gF = (is * debe) / VT;
    const gR = (is * debc) / VT;
    const ic = iF - iR - iR / br - GMIN * vbc;
    const ib = iF / bf + iR / br + GMIN * (vbe + vbc);
    const dic = [gF, -gR - gR / br - GMIN];
    const dib = [gF / bf + GMIN, gR / br + GMIN];
    return {
      i: [ic, ib, -(ic + ib)],
      g: [dic, dib, [-(dic[0] + dib[0]), -(dic[1] + dib[1])]],
    };
  }

  private junctions(ctx: StampContext): [number, number] {
    const [c, b, e] = this.spec.nodes;
    const p = this.spec.pol;
    return [p * (ctx.v(b) - ctx.v(e)), p * (ctx.v(b) - ctx.v(c))];
  }

  stamp(ctx: StampContext) {
    const [c, b, e] = this.spec.nodes;
    const p = this.spec.pol;
    let [vbe, vbc] = this.junctions(ctx);
    let l1: boolean, l2: boolean;
    [vbe, l1] = pnjlim(vbe, this.vbeOld, VT, this.vcrit);
    [vbc, l2] = pnjlim(vbc, this.vbcOld, VT, this.vcrit);
    if (l1 || l2) ctx.limited = true;
    this.vbeOld = vbe;
    this.vbcOld = vbc;
    const { i, g } = this.eval(vbe, vbc);
    // Real currents are p·i and real controlling voltages p·v, so the conductances are
    // unchanged (p² = 1) while currents and linearization voltages flip sign.
    stampLinearized(
      ctx,
      [c, b, e],
      [
        [b, e],
        [b, c],
      ],
      [p * vbe, p * vbc],
      i.map((x) => p * x),
      g,
    );
  }

  accept(ctx: StampContext) {
    [this.vbeOld, this.vbcOld] = this.junctions(ctx);
  }

  pinCurrents(ctx: StampContext) {
    const [vbe, vbc] = this.junctions(ctx);
    return this.eval(vbe, vbc).i.map((x) => this.spec.pol * x);
  }
}

// ---------------------------------------------------------------------------
// MOSFET (Shichman–Hodges level 1, body tied to source). Pins: [drain, gate, source].

class Mosfet implements Device {
  branchCount = 0;
  branch = -1;
  nonlinear = true;
  private vgsOld = 0;
  private vdsOld = 0;
  constructor(readonly spec: Extract<ElementSpec, { kind: 'M' }>) {}

  /** Forward-mode drain current and its derivatives for vds ≥ 0. */
  private forward(vgs: number, vds: number): [number, number, number] {
    const { vth, beta, lambda } = this.spec;
    const vov = vgs - vth;
    if (vov <= 0) return [0, 0, 0];
    const cl = 1 + lambda * vds;
    if (vds < vov) {
      const core = vov * vds - (vds * vds) / 2;
      return [beta * core * cl, beta * vds * cl, beta * (vov - vds) * cl + beta * core * lambda];
    }
    const core = (vov * vov) / 2;
    return [beta * core * cl, beta * vov * cl, beta * core * lambda];
  }

  /** Drain current (device polarity) and ∂/∂[vgs, vds], handling drain/source swap. */
  private eval(vgs: number, vds: number): [number, number, number] {
    let id: number, gvgs: number, gvds: number;
    if (vds >= 0) {
      const [i, gm, gds] = this.forward(vgs, vds);
      [id, gvgs, gvds] = [i, gm, gds];
    } else {
      const [i, gm, gds] = this.forward(vgs - vds, -vds);
      [id, gvgs, gvds] = [-i, -gm, gm + gds];
    }
    return [id + GMIN * vds, gvgs, gvds + GMIN];
  }

  private ctrl(ctx: StampContext): [number, number] {
    const [d, g, s] = this.spec.nodes;
    const p = this.spec.pol;
    return [p * (ctx.v(g) - ctx.v(s)), p * (ctx.v(d) - ctx.v(s))];
  }

  stamp(ctx: StampContext) {
    const [d, g, s] = this.spec.nodes;
    const p = this.spec.pol;
    let [vgs, vds] = this.ctrl(ctx);
    // Simple limiting: cap the per-iteration change of the gate drive.
    const maxStep = 1;
    if (Math.abs(vgs - this.vgsOld) > maxStep) {
      vgs = this.vgsOld + Math.sign(vgs - this.vgsOld) * maxStep;
      ctx.limited = true;
    }
    if (Math.abs(vds - this.vdsOld) > 4 * maxStep) {
      vds = this.vdsOld + Math.sign(vds - this.vdsOld) * 4 * maxStep;
      ctx.limited = true;
    }
    this.vgsOld = vgs;
    this.vdsOld = vds;
    const [id, gm, gds] = this.eval(vgs, vds);
    // Same polarity trick as the BJT: real current p·id, real controls p·v.
    stampLinearized(
      ctx,
      [d, s],
      [
        [g, s],
        [d, s],
      ],
      [p * vgs, p * vds],
      [p * id, -p * id],
      [
        [gm, gds],
        [-gm, -gds],
      ],
    );
  }

  accept(ctx: StampContext) {
    [this.vgsOld, this.vdsOld] = this.ctrl(ctx);
  }

  pinCurrents(ctx: StampContext) {
    const [vgs, vds] = this.ctrl(ctx);
    const id = this.spec.pol * this.eval(vgs, vds)[0];
    return [id, 0, -id];
  }
}

// ---------------------------------------------------------------------------
// Op-amp: high-gain differential amplifier whose output saturates smoothly at the
// rails. Pins: [inverting, non-inverting, output]. Inputs draw no current.

class OpAmp implements Device {
  branchCount = 1;
  branch = -1;
  nonlinear = true;
  private xOld = 0; // normalized drive gain·vd/half
  constructor(readonly spec: Extract<ElementSpec, { kind: 'OA' }>) {}

  private get mid() {
    return (this.spec.vpos + this.spec.vneg) / 2;
  }
  private get half() {
    return Math.max(1e-3, (this.spec.vpos - this.spec.vneg) / 2);
  }

  stamp(ctx: StampContext) {
    const [inn, inp, out] = this.spec.nodes;
    const k = this.branch;
    const { gain } = this.spec;
    const half = this.half;
    let x = (gain * (ctx.v(inp) - ctx.v(inn))) / half;
    // When the output was saturated and the drive flips sign, restart from the linear
    // region instead of jumping rail-to-rail (which can oscillate under feedback).
    if (Math.abs(this.xOld) > 2 && Math.sign(x) !== Math.sign(this.xOld)) {
      x = 0;
      ctx.limited = true;
    } else if (Math.abs(x - this.xOld) > 4 && Math.abs(this.xOld) < 2 && Math.abs(x) > 4) {
      x = Math.sign(x) * 4;
      ctx.limited = true;
    }
    this.xOld = x;
    const vd = (x * half) / gain;
    const th = Math.tanh(x);
    const f = this.mid + half * th;
    const df = gain * (1 - th * th); // ∂f/∂vd
    // Output: ideal voltage source from ground to `out` with value f(vd).
    ctx.addA(out, k, 1);
    ctx.addA(k, out, 1);
    ctx.addA(k, inp, -df);
    ctx.addA(k, inn, df);
    ctx.addB(k, f - df * vd);
  }

  accept(ctx: StampContext) {
    const [inn, inp] = this.spec.nodes;
    this.xOld = (this.spec.gain * (ctx.v(inp) - ctx.v(inn))) / this.half;
  }

  pinCurrents(ctx: StampContext) {
    return [0, 0, ctx.x[this.branch]];
  }
}

export function createDevice(spec: ElementSpec): Device {
  switch (spec.kind) {
    case 'R':
      return new Resistor(spec);
    case 'C':
      return new Capacitor(spec);
    case 'L':
      return new Inductor(spec);
    case 'V':
      return new VoltageSource(spec);
    case 'I':
      return new CurrentSource(spec);
    case 'D':
      return new Diode(spec);
    case 'Q':
      return new Bjt(spec);
    case 'M':
      return new Mosfet(spec);
    case 'OA':
      return new OpAmp(spec);
  }
}
