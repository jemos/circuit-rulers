// Operating point + fixed-grid transient analysis.

import { createDevice, Device, ElementSpec, GMIN, StampContext } from './devices';
import { SingularMatrixError, solveInPlace } from './linalg';

export interface SimSettings {
  stopTime: number;
  steps: number;
  /** 'dc': start from the DC operating point. 'zero': capacitors/inductors start at their initial condition (default 0). */
  start: 'dc' | 'zero';
  method: 'trap' | 'be';
}

export interface SimInput {
  nodeCount: number; // non-ground nodes, indexed 0..nodeCount-1
  elements: ElementSpec[];
}

export interface SimResult {
  times: Float64Array;
  /** nodeV[node][step] */
  nodeV: Float64Array[];
  /** pinI[elementId][pin][step], current INTO the element at that pin */
  pinI: Map<string, Float64Array[]>;
  /** Present if the run stopped early; results up to `times.length` are valid. */
  error?: string;
}

const MAX_ITER = 150;
const RELTOL = 1e-6;
const VNTOL = 1e-6;

export class NonConvergenceError extends Error {}

class Engine {
  readonly devices: Device[];
  readonly ctx: StampContext;
  readonly nodeCount: number;
  private work: Float64Array;
  private rhs: Float64Array;

  constructor(input: SimInput) {
    this.nodeCount = input.nodeCount;
    this.devices = input.elements.map(createDevice);
    let next = input.nodeCount;
    for (const d of this.devices) {
      d.branch = next;
      next += d.branchCount;
    }
    this.ctx = new StampContext(next);
    this.work = new Float64Array(next * next);
    this.rhs = new Float64Array(next);
  }

  get size() {
    return this.ctx.n;
  }

  private assemble() {
    const ctx = this.ctx;
    ctx.clear();
    for (let i = 0; i < this.nodeCount; i++) ctx.addA(i, i, GMIN);
    for (const d of this.devices) d.stamp(ctx);
  }

  /** Newton–Raphson from the current ctx.x. Throws on failure; ctx.x holds the solution. */
  newton(maxIter = MAX_ITER) {
    const ctx = this.ctx;
    const n = this.size;
    const linear = !this.devices.some((d) => d.nonlinear);
    for (let iter = 0; iter < maxIter; iter++) {
      this.assemble();
      this.work.set(ctx.A);
      this.rhs.set(ctx.b);
      solveInPlace(this.work, this.rhs, n);
      if (this.rhs.some((v) => !Number.isFinite(v))) throw new NonConvergenceError('Solution diverged');
      let converged = !ctx.limited;
      for (let i = 0; i < n; i++) {
        const tol = RELTOL * Math.max(Math.abs(this.rhs[i]), Math.abs(ctx.x[i])) + VNTOL;
        if (Math.abs(this.rhs[i] - ctx.x[i]) > tol) converged = false;
      }
      ctx.x.set(this.rhs);
      if (linear || (converged && iter > 0)) return;
    }
    throw new NonConvergenceError('Newton iteration did not converge');
  }

  accept() {
    for (const d of this.devices) d.accept(this.ctx);
  }

  /** Initial solution at t = 0. */
  initial(start: SimSettings['start']) {
    const ctx = this.ctx;
    ctx.t = 0;
    ctx.mode = start === 'dc' ? { kind: 'dc' } : { kind: 'ic' };
    ctx.x.fill(0);
    try {
      ctx.sourceScale = 1;
      this.newton();
    } catch (e) {
      if (e instanceof SingularMatrixError) throw e;
      // Source stepping: ramp all independent sources up from zero.
      ctx.x.fill(0);
      const steps = 20;
      for (let s = 1; s <= steps; s++) {
        ctx.sourceScale = s / steps;
        this.newton(400);
      }
    } finally {
      ctx.sourceScale = 1;
    }
    this.accept();
  }

  /** Advance from t to t + h, subdividing the step when Newton fails. */
  step(t: number, h: number, method: 'trap' | 'be', first: boolean, depth = 0) {
    const ctx = this.ctx;
    const saved = ctx.x.slice();
    try {
      ctx.t = t + h;
      ctx.mode = { kind: 'tran', h, method: first ? 'be' : method };
      this.newton();
      this.accept();
    } catch (e) {
      if (!(e instanceof NonConvergenceError) || depth >= 8) throw e;
      ctx.x.set(saved);
      this.step(t, h / 2, method, first, depth + 1);
      this.step(t + h / 2, h / 2, method, false, depth + 1);
    }
  }

  pinCurrents(d: Device) {
    return d.pinCurrents(this.ctx);
  }
}

function errorMessage(e: unknown, engine?: Engine): string {
  if (e instanceof SingularMatrixError) {
    const n = engine?.nodeCount ?? 0;
    return e.row >= n
      ? 'The circuit has a loop of voltage sources/inductors or a source with both ends on the same net.'
      : 'Singular circuit matrix: some part of the circuit is not uniquely determined.';
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export function simulate(input: SimInput, settings: SimSettings): SimResult {
  const steps = Math.max(1, Math.floor(settings.steps));
  const h = settings.stopTime / steps;
  const times = new Float64Array(steps + 1);
  const nodeV = Array.from({ length: input.nodeCount }, () => new Float64Array(steps + 1));
  const pinI = new Map<string, Float64Array[]>();

  let engine: Engine | undefined;
  const record = (k: number) => {
    const x = engine!.ctx.x;
    times[k] = k * h;
    for (let i = 0; i < input.nodeCount; i++) nodeV[i][k] = x[i];
    for (const d of engine!.devices) {
      const cur = engine!.pinCurrents(d);
      let arr = pinI.get(d.spec.id);
      if (!arr) {
        arr = cur.map(() => new Float64Array(steps + 1));
        pinI.set(d.spec.id, arr);
      }
      cur.forEach((v, p) => (arr![p][k] = v));
    }
  };
  const truncated = (k: number, e: unknown): SimResult => ({
    times: times.slice(0, k),
    nodeV: nodeV.map((v) => v.slice(0, k)),
    pinI: new Map([...pinI].map(([id, arr]) => [id, arr.map((a) => a.slice(0, k))])),
    error: errorMessage(e, engine),
  });

  try {
    engine = new Engine(input);
    engine.initial(settings.start);
  } catch (e) {
    return truncated(0, e);
  }
  record(0);
  for (let k = 1; k <= steps; k++) {
    try {
      engine.step((k - 1) * h, h, settings.method, k === 1);
    } catch (e) {
      return truncated(k, e);
    }
    record(k);
  }
  return { times, nodeV, pinI };
}
