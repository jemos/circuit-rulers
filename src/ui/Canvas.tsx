import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { componentBounds, distToSegment, toWorld, transformAttr } from '../model/geometry';
import { KINDS, newComponent, valueText } from '../model/kinds';
import { Netlist, netAt } from '../model/netlist';
import { componentReadout, pinCurrent } from '../model/readout';
import { Region, transistorRegion } from '../model/regions';
import { NODE_COLORS, netVoltage, RulerLayoutResult, rulerWidth } from '../model/ruler';
import { nextName } from '../model/doc';
import { Component, ComponentKind, Doc, Pt, ptKey, Rot, Ruler } from '../model/types';
import { formatEng } from '../model/units';
import type { SimResult } from '../sim/simulate';
import { RulerView } from './RulerView';
import { Symbol } from './Symbol';
import type { DocHistory } from './useDocHistory';
import { applyMove, isDegenerate, route } from '../model/edit';
import { toggleProbe } from '../model/probes';
import { maxSegmentCurrent, segmentCurrents, wireCurrents } from '../model/wireCurrents';

export type Tool =
  | { type: 'select' }
  | { type: 'wire' }
  | { type: 'ruler'; editId?: string } // editId: re-picking the path of an existing ruler
  | { type: 'probe' }
  | { type: 'place'; kind: ComponentKind; rot: Rot; flip: boolean };

export interface View {
  x: number; // screen offset of world origin (px)
  y: number;
  zoom: number; // px per grid unit
}

export interface RulerInfo {
  result: RulerLayoutResult;
  lanes: number;
  k: number; // time index the ruler shows
}

interface Props {
  history: DocHistory;
  nl: Netlist;
  sim: SimResult | null;
  k: number;
  selection: Set<string>;
  setSelection: (s: Set<string>) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  view: View;
  setView: (v: View | ((v: View) => View)) => void;
  hoverNet: number | null;
  setHoverNet: (n: number | null) => void;
  rulers: Map<string, RulerInfo>;
  netColors: Map<number, string>;
  /** Colour of each probed net's trace in the plot. */
  probeColors: Map<number, string>;
  showCurrents: boolean;
  showWireCurrents: boolean;
  showRegions: boolean;
  /** Tool-specific transient state, owned by the parent so Escape can clear it. */
  pending: Pt | null;
  setPending: (p: Pt | null) => void;
  /** Nodes clicked so far with the ruler tool. */
  rulerPath: Pt[];
  setRulerPath: (p: Pt[]) => void;
  finishRuler: () => void;
}

type Drag =
  | { type: 'move'; start: Pt; ids: Set<string> }
  | { type: 'resize'; id: string; startY: number; startH: number }
  | { type: 'box'; start: Pt; cur: Pt; additive: boolean }
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number };

const snap = (p: Pt): Pt => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** Where a new ruler goes: to the right of everything already drawn. */
export function newRulerFrame(doc: Doc, rulers: Map<string, RulerInfo>): Pick<Ruler, 'x' | 'y' | 'height'> {
  let x2 = -Infinity;
  let y1 = Infinity;
  let y2 = -Infinity;
  for (const c of doc.components) {
    const b = componentBounds(c);
    x2 = Math.max(x2, b.x2);
    y1 = Math.min(y1, b.y1);
    y2 = Math.max(y2, b.y2);
  }
  for (const r of doc.rulers) x2 = Math.max(x2, r.x + rulerWidth(rulers.get(r.id)?.lanes ?? 1));
  if (!Number.isFinite(x2)) return { x: 0, y: 0, height: 10 };
  return { x: Math.ceil(x2) + 4, y: Math.floor(y1), height: Math.max(6, Math.ceil(y2 - y1)) };
}

const ComponentView = memo(function ComponentView(props: { c: Component; selected: boolean; region: Region | null }) {
  const { c, selected, region } = props;
  const def = KINDS[c.kind];
  const anchor = toWorld(c, def.labelAt);
  const dx = anchor.x - c.x;
  const dy = anchor.y - c.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const textAnchor = horizontal ? (dx >= 0 ? 'start' : 'end') : 'middle';
  const value = valueText(c);
  let label: JSX.Element | null = null;
  if (c.kind === 'label') {
    label = (
      <text className="net-label" x={anchor.x} y={anchor.y} textAnchor={textAnchor} dy={horizontal ? '0.35em' : dy < 0 ? '0' : '0.8em'}>
        {c.text}
      </text>
    );
  } else if (c.kind !== 'ground') {
    const lines = value ? [c.name, value] : [c.name];
    if (region) lines.push(region.short);
    const y0 = horizontal ? anchor.y - (lines.length - 1) * 0.35 : dy < 0 ? anchor.y - (lines.length - 1) * 0.7 : anchor.y + 0.5;
    label = (
      <text className="comp-label" x={anchor.x} y={y0} textAnchor={textAnchor}>
        {lines.map((l, i) => (
          <tspan
            key={i}
            x={anchor.x}
            dy={i === 0 ? '0.35em' : '1.2em'}
            className={i === 0 ? 'comp-name' : region && i === lines.length - 1 ? `region region-${region.role}` : 'comp-value'}
          >
            {l}
            {region && i === lines.length - 1 && <title>{`${region.long}: ${region.why}`}</title>}
          </tspan>
        ))}
      </text>
    );
  }
  const b = componentBounds(c);
  return (
    <g className={`comp${selected ? ' selected' : ''}`} data-kind="component" data-id={c.id}>
      <rect className="hit" x={b.x1 - 0.2} y={b.y1 - 0.2} width={b.x2 - b.x1 + 0.4} height={b.y2 - b.y1 + 0.4} />
      <g className="sym" transform={transformAttr(c)}>
        <Symbol kind={c.kind} wave={c.wave} />
      </g>
      {label}
    </g>
  );
});

// Light silver at no current through warm orange to red at the run's largest.
const HEAT: [number, number, number][] = [
  [178, 182, 188],
  [255, 190, 110],
  [255, 59, 48],
];
function heatColor(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(x));
  const f = x - i;
  const [r, g, b] = HEAT[i].map((v, j) => Math.round(v + (HEAT[i + 1][j] - v) * f));
  return `rgb(${r},${g},${b})`;
}

function Arrow({ at, dir, size }: { at: Pt; dir: Pt; size: number }) {
  const px = -dir.y;
  const py = dir.x;
  const tip = { x: at.x + dir.x * size, y: at.y + dir.y * size };
  const b = { x: at.x - dir.x * size, y: at.y - dir.y * size };
  const w = size * 0.85;
  return <path className="current-arrow" d={`M${tip.x},${tip.y}L${b.x + px * w},${b.y + py * w}L${b.x - px * w},${b.y - py * w}Z`} />;
}

export function Canvas(props: Props) {
  const { history, nl, sim, k, selection, setSelection, tool, setTool, view, setView } = props;
  const { hoverNet, setHoverNet, rulers, netColors, probeColors, showCurrents, showWireCurrents, showRegions, pending, setPending } = props;
  const { rulerPath, setRulerPath, finishRuler } = props;
  const doc = history.doc;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState<Pt>({ x: 0, y: 0 }); // world, unsnapped
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null);
  const [hover, setHover] = useState<{ id: string; sx: number; sy: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const toWorldPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.zoom, y: (e.clientY - r.top - view.y) / view.zoom };
  };

  // Wheel: pan, pinch/ctrl+wheel: zoom around the cursor.
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        setView((v) => {
          const zoom = Math.min(80, Math.max(6, v.zoom * Math.exp(-e.deltaY * 0.01)));
          const f = zoom / v.zoom;
          return { zoom, x: mx - (mx - v.x) * f, y: my - (my - v.y) * f };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [setView]);

  useEffect(() => setStatus(null), [tool]);

  const isConnectionPoint = (p: Pt) =>
    nl.pointNets.has(ptKey(p)) || doc.wires.some((w) => distToSegment(p, w.a, w.b) < 1e-9);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Commit any inspector field being edited before this click changes the selection and
    // unmounts it (its onBlur saves the value). Focus no longer moves on its own, since
    // mousedown's default is prevented.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
    const svg = svgRef.current!;
    const world = toWorldPt(e);
    const p = snap(world);
    if (e.button === 1) {
      drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 2) {
      if (tool.type === 'wire' && pending) setPending(null);
      else if (tool.type === 'ruler' && rulerPath.length >= 2) finishRuler();
      else if (tool.type === 'ruler' && rulerPath.length) setRulerPath([]);
      else if (tool.type !== 'select') setTool({ type: 'select' });
      return;
    }
    if (e.button !== 0) return;

    if (tool.type === 'place') {
      const t = tool;
      history.commit((d) => {
        const c = newComponent(t.kind, `e${d.nextId++}`, nextName(d, t.kind), p.x, p.y);
        c.rot = t.rot;
        c.flip = t.flip;
        d.components.push(c);
      });
      return;
    }

    if (tool.type === 'wire') {
      if (!pending) {
        setPending(p);
        return;
      }
      if (p.x === pending.x && p.y === pending.y) {
        if (e.detail >= 2) setPending(null);
        return;
      }
      const pts = route(pending, p);
      history.commit((d) => {
        for (let i = 1; i < pts.length; i++) d.wires.push({ id: `e${d.nextId++}`, a: pts[i - 1], b: pts[i] });
      });
      setPending(isConnectionPoint(p) ? null : p);
      return;
    }

    if (tool.type === 'ruler') {
      const net = netAt(nl, doc.wires, p);
      if (net === undefined) {
        setStatus('Click on a wire or a pin to pick a node.');
        return;
      }
      const nets = rulerPath.map((q) => netAt(nl, doc.wires, q));
      if (nets.length && nets[nets.length - 1] === net) {
        // Clicking the last node again (or double-clicking it) finishes the path.
        if (rulerPath.length >= 2) finishRuler();
        else setStatus('Pick at least one more node.');
        return;
      }
      if (nets.includes(net)) {
        setStatus(`${nl.nets[net].name} is already in the path.`);
        return;
      }
      setRulerPath([...rulerPath, p]);
      setStatus(null);
      return;
    }

    if (tool.type === 'probe') {
      const net = netAt(nl, doc.wires, p);
      if (net === undefined) {
        setStatus('Click on a wire or a pin to pick a node.');
        return;
      }
      const { name, node } = nl.nets[net];
      if (node < 0) {
        setStatus(`${name} is the 0 V reference.`);
        return;
      }
      const on = probeColors.has(net);
      history.commit((d) => toggleProbe(d, nl, p));
      setStatus(on ? `Removed ${name} from the plot.` : `Added ${name} to the plot.`);
      return;
    }

    // Select tool
    const target = (e.target as Element).closest('[data-kind]');
    const kind = target?.getAttribute('data-kind');
    const id = target?.getAttribute('data-id') ?? '';
    if (kind === 'ruler-resize') {
      const r = doc.rulers.find((r) => r.id === id)!;
      drag.current = { type: 'resize', id, startY: world.y, startH: r.height };
      setSelection(new Set([id]));
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (kind === 'component' || kind === 'wire' || kind === 'ruler') {
      let sel = selection;
      if (e.shiftKey) {
        sel = new Set(selection);
        if (sel.has(id)) sel.delete(id);
        else sel.add(id);
      } else if (!selection.has(id)) {
        sel = new Set([id]);
      }
      setSelection(sel);
      drag.current = { type: 'move', start: p, ids: sel };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (!e.shiftKey) setSelection(new Set());
    drag.current = { type: 'box', start: world, cur: world, additive: e.shiftKey };
    svg.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const world = toWorldPt(e);
    setCursor(world);
    const d = drag.current;
    if (!d) {
      const target = (e.target as Element).closest('[data-kind]');
      const kind = target?.getAttribute('data-kind');
      const id = target?.getAttribute('data-id');
      const r = svgRef.current!.getBoundingClientRect();
      if ((kind === 'component' || kind === 'wire') && id) {
        setHover({ id, sx: e.clientX - r.left, sy: e.clientY - r.top });
        if (kind === 'wire') setHoverNet(nl.wireNets.get(id) ?? null);
      } else if (hover) {
        setHover(null);
        setHoverNet(null);
      }
      return;
    }
    if (d.type === 'pan') {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    } else if (d.type === 'move') {
      const p = snap(world);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      history.gesture((doc) => applyMove(doc, d.ids, dx, dy));
    } else if (d.type === 'resize') {
      const h = Math.max(4, Math.round(d.startH + world.y - d.startY));
      history.gesture((doc) => {
        const r = doc.rulers.find((r) => r.id === d.id);
        if (r) r.height = h;
      });
    } else if (d.type === 'box') {
      d.cur = world;
      setBox({ a: d.start, b: world });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    history.endGesture();
    if (d?.type === 'box') {
      setBox(null);
      const x1 = Math.min(d.start.x, d.cur.x);
      const x2 = Math.max(d.start.x, d.cur.x);
      const y1 = Math.min(d.start.y, d.cur.y);
      const y2 = Math.max(d.start.y, d.cur.y);
      if (x2 - x1 < 0.3 && y2 - y1 < 0.3) return;
      const inside = (p: Pt) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
      const sel = new Set(d.additive ? selection : []);
      for (const c of doc.components) {
        const b = componentBounds(c);
        if (inside({ x: b.x1, y: b.y1 }) && inside({ x: b.x2, y: b.y2 })) sel.add(c.id);
      }
      for (const w of doc.wires) if (inside(w.a) && inside(w.b)) sel.add(w.id);
      for (const r of doc.rulers) {
        const w = rulerWidth(rulers.get(r.id)?.lanes ?? 1);
        if (inside({ x: r.x, y: r.y }) && inside({ x: r.x + w, y: r.y + r.height })) sel.add(r.id);
      }
      setSelection(sel);
    }
  };

  // Largest current in the run, for scaling the arrows.
  const iMax = useMemo(() => {
    let m = 0;
    if (!sim) return m;
    for (const pins of sim.pinI.values()) for (const s of pins) for (const v of s) m = Math.max(m, Math.abs(v));
    return m;
  }, [sim]);

  // Current through each wire segment, coloured on the same square-root scale as the arrows.
  const wc = useMemo(
    () => (showWireCurrents ? wireCurrents(doc, nl) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showWireCurrents, doc.components, doc.wires, nl],
  );
  const wireIMax = useMemo(() => (wc && sim ? maxSegmentCurrent(wc, sim) : 0), [wc, sim]);
  const wireHeat = useMemo(() => {
    const m = new Map<string, { a: Pt; b: Pt; color: string }[]>();
    if (!wc || !sim || wireIMax <= 0) return m;
    const cur = segmentCurrents(wc, sim, k);
    wc.segments.forEach((s, i) => {
      const t = Math.abs(cur[i]) < wireIMax * 1e-3 ? 0 : Math.sqrt(Math.abs(cur[i]) / wireIMax);
      let list = m.get(s.wire);
      if (!list) m.set(s.wire, (list = []));
      list.push({ a: s.a, b: s.b, color: heatColor(t) });
    });
    return m;
  }, [wc, sim, k, wireIMax]);

  const cursorSnap = snap(cursor);
  const cursorStyle = drag.current?.type === 'pan' ? 'grabbing' : tool.type === 'select' ? 'default' : 'crosshair';

  const gridOn = view.zoom >= 8;
  const hoverComp = hover ? doc.components.find((c) => c.id === hover.id) : undefined;
  const hoverWireNet = hover && !hoverComp ? nl.wireNets.get(hover.id) : undefined;

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas"
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        // Stop the browser from starting a text selection (Safari ignores user-select on SVG text).
        onMouseDown={(e) => e.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          if (!drag.current) setHoverNet(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern
            id="grid"
            width={view.zoom}
            height={view.zoom}
            patternUnits="userSpaceOnUse"
            x={view.x % view.zoom}
            y={view.y % view.zoom}
          >
            <circle cx={0.5} cy={0.5} r={0.9} className="grid-dot" />
          </pattern>
        </defs>
        {gridOn && <rect width="100%" height="100%" fill="url(#grid)" />}
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <g className="wires">
            {doc.wires.map((w) => {
              if (isDegenerate(w)) return null; // a zero-length line would draw as a huge round cap
              const net = nl.wireNets.get(w.id);
              const color = net !== undefined ? netColors.get(net) : undefined;
              const hot = net !== undefined && net === hoverNet;
              const selected = selection.has(w.id);
              const heat = selected ? undefined : wireHeat.get(w.id);
              return (
                <g key={w.id} data-kind="wire" data-id={w.id} className={`wire${selected ? ' selected' : ''}${hot ? ' hot' : ''}`}>
                  <line className="hit" x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
                  {heat ? (
                    heat.map((s, i) => <line key={i} className="heat" x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} style={{ stroke: s.color }} />)
                  ) : (
                    <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} style={color ? { stroke: color } : undefined} />
                  )}
                </g>
              );
            })}
          </g>
          {nl.junctions.map((p) => (
            <circle key={ptKey(p)} className="junction" cx={p.x} cy={p.y} r={0.17} />
          ))}
          {doc.components.map((c) => (
            <ComponentView
              key={c.id}
              c={c}
              selected={selection.has(c.id)}
              region={showRegions ? transistorRegion(c, nl, sim, k) : null}
            />
          ))}
          {nl.openPins.map((p, i) => (
            <circle key={i} className="open-pin" cx={p.x} cy={p.y} r={0.14} />
          ))}
          {showCurrents && sim && iMax > 0 && (
            <g className="currents">
              {doc.components.flatMap((c) => {
                const def = KINDS[c.kind];
                if (c.kind === 'ground' || c.kind === 'label') return [];
                return def.pins.flatMap((pin, i) => {
                  const cur = pinCurrent(sim, c.id, i, k);
                  if (cur === undefined || Math.abs(cur) < iMax * 1e-3 || Math.abs(cur) < 1e-12) return [];
                  const u = Math.abs(pin.x) >= Math.abs(pin.y) ? { x: -Math.sign(pin.x), y: 0 } : { x: 0, y: -Math.sign(pin.y) };
                  const at = toWorld(c, { x: pin.x + u.x * 0.55, y: pin.y + u.y * 0.55 });
                  const ahead = toWorld(c, { x: pin.x + u.x * 1.55, y: pin.y + u.y * 1.55 });
                  const s = cur > 0 ? 1 : -1;
                  const dir = { x: (ahead.x - at.x) * s, y: (ahead.y - at.y) * s };
                  const size = 0.12 + 0.2 * Math.sqrt(Math.abs(cur) / iMax);
                  return [<Arrow key={`${c.id}:${i}`} at={at} dir={dir} size={size} />];
                });
              })}
            </g>
          )}
          {doc.rulers.map((r) => {
            const info = rulers.get(r.id);
            if (!info) return null;
            return (
              <RulerView
                key={r.id}
                ruler={r}
                result={info.result}
                nl={nl}
                sim={sim}
                k={info.k}
                time={sim?.times[Math.min(info.k, sim.times.length - 1)] ?? 0}
                lanes={info.lanes}
                selected={selection.has(r.id)}
                hoverNet={hoverNet}
                onHoverNet={setHoverNet}
              />
            );
          })}

          {/* tool previews */}
          {tool.type === 'place' && (
            <g className="sym ghost" transform={transformAttr({ x: cursorSnap.x, y: cursorSnap.y, rot: tool.rot, flip: tool.flip })}>
              <Symbol kind={tool.kind} />
            </g>
          )}
          {tool.type === 'wire' && (
            <>
              <circle className="cursor-dot" cx={cursorSnap.x} cy={cursorSnap.y} r={0.15} />
              {pending && (
                <polyline className="wire-preview" points={route(pending, cursorSnap).map((p) => `${p.x},${p.y}`).join(' ')} />
              )}
            </>
          )}
          {tool.type === 'ruler' && (
            <g className="ruler-draft">
              {rulerPath.length > 0 && (
                <polyline
                  className="ruler-pick-line"
                  points={[...rulerPath, cursorSnap].map((q) => `${q.x},${q.y}`).join(' ')}
                />
              )}
              {rulerPath.map((q, i) => (
                <g key={i}>
                  <circle className="ruler-pick" cx={q.x} cy={q.y} r={0.42} style={{ stroke: NODE_COLORS[i % NODE_COLORS.length] }} />
                  <text className="ruler-pick-num" x={q.x + 0.5} y={q.y - 0.45} style={{ fill: NODE_COLORS[i % NODE_COLORS.length] }}>
                    {i + 1}
                  </text>
                </g>
              ))}
              <circle className="cursor-dot" cx={cursorSnap.x} cy={cursorSnap.y} r={0.2} />
            </g>
          )}
          {tool.type === 'probe' &&
            doc.probes.map((q, i) => {
              const net = netAt(nl, doc.wires, q);
              const color = net !== undefined ? probeColors.get(net) : undefined;
              return color ? <circle key={i} className="probe-mark" cx={q.x} cy={q.y} r={0.38} style={{ stroke: color }} /> : null;
            })}
          {tool.type === 'probe' && <circle className="cursor-dot" cx={cursorSnap.x} cy={cursorSnap.y} r={0.2} />}
          {box && (
            <rect
              className="select-box"
              x={Math.min(box.a.x, box.b.x)}
              y={Math.min(box.a.y, box.b.y)}
              width={Math.abs(box.b.x - box.a.x)}
              height={Math.abs(box.b.y - box.a.y)}
            />
          )}
        </g>
      </svg>

      {hover && (hoverComp || hoverWireNet !== undefined) && !drag.current && (
        <div className="tooltip" style={{ left: hover.sx + 14, top: hover.sy + 14 }}>
          {hoverComp ? (
            <>
              <div className="tooltip-title">{hoverComp.kind === 'label' ? hoverComp.text : hoverComp.name}</div>
              {componentReadout(hoverComp, nl, sim, k).map((l) => (
                <div key={l.label} className="tooltip-row">
                  <span>{l.label}</span>
                  <span className="mono">{l.value}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="tooltip-row">
              <span>{nl.nets[hoverWireNet!].name}</span>
              <span className="mono">{formatEng(netVoltage(nl, sim, hoverWireNet!, k), 'V')}</span>
            </div>
          )}
        </div>
      )}
      {wireHeat.size > 0 && (
        <div className="heat-legend" title="Wire colour: current magnitude, square-root scale, up to the largest in the run">
          <span>0</span>
          <span className="heat-bar" style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(heatColor).join(', ')})` }} />
          <span className="mono">{formatEng(wireIMax, 'A')}</span>
        </div>
      )}
      {(status || tool.type !== 'select') && (
        <div className="hint">
          {status ??
            (tool.type === 'wire'
              ? pending
                ? 'Click to add a corner · click a pin or wire to finish · Esc to stop'
                : 'Click to start a wire'
              : tool.type === 'ruler'
                ? rulerPath.length === 0
                  ? 'Click the nodes the ruler should measure, in order (wires or pins)'
                  : `${rulerPath.map((q) => nl.nets[netAt(nl, doc.wires, q) ?? -1]?.name ?? '?').join(' → ')} · click the next node · Enter or double-click to finish · ⌫ undo · Esc cancel`
                : tool.type === 'probe'
                  ? 'Click a node to add it to the plot as an extra trace · click it again to remove · Esc done'
                  : tool.type === 'place'
                    ? `Click to place ${KINDS[tool.kind].title.toLowerCase()} · R rotate · F flip · Esc done`
                    : '')}
        </div>
      )}
    </div>
  );
}
