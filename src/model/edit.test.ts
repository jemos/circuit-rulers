import { describe, expect, it } from 'vitest';
import { DocBuilder, isDoc } from './doc';
import { applyMove } from './edit';
import { EXAMPLES } from './examples';
import { buildNetlist } from './netlist';

describe('moving parts', () => {
  it('keeps a part connected to a touching pin with a stretch wire', () => {
    const b = new DocBuilder();
    const c = b.add('capacitor', 0, 0); // pins (0,-2), (0,2)
    b.add('ground', 0, 2);
    applyMove(b.doc, new Set([c.id]), 0, -3);
    expect(b.doc.wires).toEqual([expect.objectContaining({ a: { x: 0, y: 2 }, b: { x: 0, y: -1 } })]);
    const nl = buildNetlist(b.doc);
    expect(nl.pinNets.get(c.id)![1]).toBe(nl.nets.findIndex((n) => n.isGround));
  });

  it('never leaves a zero-length wire (inverter: move CL down, then its ground onto it)', () => {
    const doc = EXAMPLES.find((e) => e.id === 'cmos')!.build();
    const cl = doc.components.find((c) => c.name === 'CL')!; // at (14,10), pins (14,8) and (14,12)
    const gnd = doc.components.find((c) => c.kind === 'ground' && c.x === 14 && c.y === 12)!;
    applyMove(doc, new Set([cl.id]), 0, 2); // stretch wire (14,12) → (14,14) from the ground
    expect(doc.wires.some((w) => w.a.y === 12 && w.b.y === 14 && w.a.x === 14)).toBe(true);
    applyMove(doc, new Set([gnd.id]), 0, 2); // ground lands on the cap's new pin
    expect(doc.wires.filter((w) => w.a.x === w.b.x && w.a.y === w.b.y)).toEqual([]);
    const nl = buildNetlist(doc);
    expect(nl.pinNets.get(cl.id)![1]).toBe(nl.nets.findIndex((n) => n.isGround));
  });

  it('carries probes on a moved pin along', () => {
    const b = new DocBuilder();
    const r = b.add('resistor', 0, 0); // pins (0,-2), (0,2)
    b.doc.probes = [{ x: 0, y: -2 }, { x: 5, y: 5 }];
    applyMove(b.doc, new Set([r.id]), 3, 0);
    expect(b.doc.probes).toEqual([{ x: 3, y: -2 }, { x: 5, y: 5 }]);
  });

  it('cleans zero-length wires out of saved documents', () => {
    const b = new DocBuilder();
    b.wire([1, 1], [1, 1]);
    b.wire([0, 0], [3, 0]);
    const saved = JSON.parse(JSON.stringify(b.doc));
    expect(isDoc(saved)).toBe(true);
    expect(saved.wires).toHaveLength(1);
  });
});
