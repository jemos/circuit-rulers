import { KINDS } from './kinds';
import { Component, Pt, Rot } from './types';

/** Local symbol coordinates → world grid coordinates. */
export function toWorld(c: Pick<Component, 'x' | 'y' | 'rot' | 'flip'>, p: Pt): Pt {
  let { x, y } = p;
  if (c.flip) x = -x;
  for (let i = 0; i < c.rot; i++) [x, y] = [-y, x];
  return { x: c.x + x + 0, y: c.y + y + 0 }; // "+ 0" normalizes -0
}

export function pinPositions(c: Component): Pt[] {
  return KINDS[c.kind].pins.map((p) => toWorld(c, p));
}

export function transformAttr(c: Pick<Component, 'x' | 'y' | 'rot' | 'flip'>): string {
  return `translate(${c.x} ${c.y}) rotate(${c.rot * 90})${c.flip ? ' scale(-1 1)' : ''}`;
}

export const rotateCW = (r: Rot): Rot => ((r + 1) % 4) as Rot;

/** True if p lies on segment a–b (inclusive of endpoints when `inclusive`). */
export function onSegment(p: Pt, a: Pt, b: Pt, inclusive: boolean): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (inclusive) return dot >= 0 && dot <= len2;
  return dot > 0 && dot < len2;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Approximate bounding box of a component's symbol in world coordinates. */
export function componentBounds(c: Component): { x1: number; y1: number; x2: number; y2: number } {
  const pts = [...KINDS[c.kind].pins, { x: -0.8, y: -1 }, { x: 0.8, y: 1 }].map((p) => toWorld(c, p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}
