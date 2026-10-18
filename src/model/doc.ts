import { isDegenerate } from './edit';
import { KINDS, newComponent } from './kinds';
import { Component, ComponentKind, Doc, Pt, Rot, Ruler } from './types';

export function emptyDoc(): Doc {
  return {
    version: 1,
    components: [],
    wires: [],
    rulers: [],
    probes: [],
    sim: { stopTime: 10e-3, steps: 1000, start: 'dc', method: 'trap' },
    nextId: 1,
  };
}

export function nextName(doc: Doc, kind: ComponentKind): string {
  const prefix = KINDS[kind].prefix;
  if (kind === 'ground' || kind === 'label') return prefix;
  const used = new Set(doc.components.map((c) => c.name));
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function nextRulerName(doc: Doc): string {
  const used = new Set(doc.rulers.map((r) => r.name));
  let i = 1;
  while (used.has(`Ruler ${i}`)) i++;
  return `Ruler ${i}`;
}

/** Mutable helper for building documents in code (examples, tests). */
export class DocBuilder {
  doc = emptyDoc();
  private id() {
    return `e${this.doc.nextId++}`;
  }
  add(
    kind: ComponentKind,
    x: number,
    y: number,
    opts: Partial<Pick<Component, 'rot' | 'flip' | 'params' | 'wave' | 'text' | 'name'>> = {},
  ): Component {
    const c = newComponent(kind, this.id(), opts.name ?? nextName(this.doc, kind), x, y);
    c.rot = (opts.rot ?? 0) as Rot;
    c.flip = opts.flip ?? false;
    Object.assign(c.params, opts.params);
    if (opts.wave) c.wave = opts.wave;
    if (opts.text !== undefined) c.text = opts.text;
    this.doc.components.push(c);
    return c;
  }
  /** Polyline wire through the given points. */
  wire(...pts: [number, number][]) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      this.doc.wires.push({ id: this.id(), a: { x: ax, y: ay }, b: { x: bx, y: by } });
    }
  }
  /** Ruler measuring the nodes at `path` (grid points), in order. */
  ruler(
    path: [number, number][],
    x: number,
    y: number,
    height: number,
    pinnedTime: number | null = null,
    opts: Partial<Pick<Ruler, 'name' | 'scale'>> = {},
  ): Ruler {
    const r: Ruler = {
      ...opts,
      id: this.id(),
      name: opts.name ?? nextRulerName(this.doc),
      path: path.map(([px, py]) => ({ x: px, y: py })),
      x,
      y,
      height,
      pinnedTime,
    };
    this.doc.rulers.push(r);
    return r;
  }
}

/** Basic structural validation of a loaded document; upgrades older ruler formats in place. */
export function isDoc(x: unknown): x is Doc {
  const d = x as Doc;
  const ok =
    !!d &&
    d.version === 1 &&
    Array.isArray(d.components) &&
    Array.isArray(d.wires) &&
    Array.isArray(d.rulers) &&
    typeof d.sim?.stopTime === 'number' &&
    typeof d.nextId === 'number';
  if (ok) {
    if (!Array.isArray(d.probes)) d.probes = [];
    // Older versions could leave zero-length wires behind after a drag.
    d.wires = d.wires.filter((w) => !isDegenerate(w));
    // Rulers used to be defined by a top and bottom point only.
    for (const r of d.rulers as (Ruler & { top?: Pt; bottom?: Pt; hidden?: Pt[] })[]) {
      if (!Array.isArray(r.path)) r.path = r.top && r.bottom ? [r.top, r.bottom] : [];
      delete r.top;
      delete r.bottom;
      delete r.hidden;
    }
  }
  return ok;
}
