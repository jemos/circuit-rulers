// Geometric edits on a document: wire routing and moving parts.

import { pinPositions } from './geometry';
import { Doc, Pt, ptKey, Wire } from './types';

export const isDegenerate = (w: Wire) => w.a.x === w.b.x && w.a.y === w.b.y;

/** Two-segment orthogonal route from a to b. */
export function route(a: Pt, b: Pt): Pt[] {
  if (a.x === b.x || a.y === b.y) return [a, b];
  const corner = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [a, corner, b];
}

/** Apply a move of `ids` by (dx, dy), stretching wires attached to moved pins. */
export function applyMove(d: Doc, ids: Set<string>, dx: number, dy: number) {
  if (dx === 0 && dy === 0) return;
  const remap = new Map<string, Pt>();
  const stayingPins = new Set<string>();
  const stretch: Wire[] = [];
  for (const c of d.components) if (!ids.has(c.id)) for (const p of pinPositions(c)) stayingPins.add(ptKey(p));
  for (const c of d.components) {
    if (!ids.has(c.id)) continue;
    for (const p of pinPositions(c)) {
      const to = { x: p.x + dx, y: p.y + dy };
      remap.set(ptKey(p), to);
      // Pin touching a part that stays: keep them connected with a new wire.
      if (stayingPins.has(ptKey(p))) {
        const pts = route(p, to);
        for (let i = 1; i < pts.length; i++) stretch.push({ id: `e${d.nextId++}`, a: pts[i - 1], b: pts[i] });
      }
    }
    c.x += dx;
    c.y += dy;
  }
  for (const w of d.wires) {
    if (ids.has(w.id)) {
      remap.set(ptKey(w.a), { x: w.a.x + dx, y: w.a.y + dy });
      remap.set(ptKey(w.b), { x: w.b.x + dx, y: w.b.y + dy });
      w.a = { x: w.a.x + dx, y: w.a.y + dy };
      w.b = { x: w.b.x + dx, y: w.b.y + dy };
    }
  }
  for (const w of d.wires) {
    if (ids.has(w.id)) continue;
    w.a = remap.get(ptKey(w.a)) ?? w.a;
    w.b = remap.get(ptKey(w.b)) ?? w.b;
  }
  for (const r of d.rulers) {
    if (ids.has(r.id)) {
      r.x += dx;
      r.y += dy;
    }
    r.path = r.path.map((p) => remap.get(ptKey(p)) ?? p);
  }
  d.probes = d.probes.map((p) => remap.get(ptKey(p)) ?? p);
  d.wires.push(...stretch);
  // A wire whose ends were both dragged onto the same point is gone; drop it.
  d.wires = d.wires.filter((w) => !isDegenerate(w));
}
