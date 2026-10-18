import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEng } from '../model/units';
import type { SimResult } from '../sim/simulate';

export interface Trace {
  name: string;
  color: string;
  values: ArrayLike<number>;
}

export interface Marker {
  label: string;
  k: number;
}

interface Props {
  sim: SimResult | null;
  k: number;
  setK: (k: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  traces: Trace[];
  tracesTitle: string;
  markers: Marker[];
}

const PLOT_H = 148;
const M = { left: 56, right: 14, top: 26, bottom: 20 };

function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function TimePanel(props: Props) {
  const { sim, k, setK, playing, setPlaying, speed, setSpeed, traces, tracesTitle, markers } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const n = sim?.times.length ?? 0;
  const tEnd = n > 0 ? sim!.times[n - 1] : 0;

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = PLOT_H - M.top - M.bottom;
  const xOfK = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * innerW : 0);

  const { lo, hi, paths } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of traces) {
      for (let i = 0; i < t.values.length; i++) {
        const v = t.values[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo)) [lo, hi] = [-1, 1];
    if (hi - lo < 1e-9) [lo, hi] = [lo - 0.5, hi + 0.5];
    const pad = (hi - lo) * 0.06;
    lo -= pad;
    hi += pad;
    const yOf = (v: number) => M.top + ((hi - v) / (hi - lo)) * innerH;
    // Downsample to ~2 points per pixel (keeping min/max per bucket) for long runs.
    const paths = traces.map((t) => {
      const len = t.values.length;
      const buckets = Math.min(len, Math.ceil(innerW));
      const parts: string[] = [];
      for (let b = 0; b < buckets; b++) {
        const i0 = Math.floor((b * len) / buckets);
        const i1 = Math.max(i0 + 1, Math.floor(((b + 1) * len) / buckets));
        let mn = Infinity;
        let mx = -Infinity;
        for (let i = i0; i < i1; i++) {
          mn = Math.min(mn, t.values[i]);
          mx = Math.max(mx, t.values[i]);
        }
        const x = (M.left + ((i0 / Math.max(1, len - 1)) * innerW)).toFixed(1);
        parts.push(`${b === 0 ? 'M' : 'L'}${x},${yOf(mn).toFixed(1)}`);
        if (mx !== mn) parts.push(`L${x},${yOf(mx).toFixed(1)}`);
      }
      return parts.join('');
    });
    return { lo, hi, paths };
  }, [traces, innerW, innerH]);

  const yOf = (v: number) => M.top + ((hi - v) / (hi - lo)) * innerH;
  const vTicks = niceTicks(lo, hi, 3);
  // Enough significant digits that neighbouring ticks never print the same text.
  const vStep = vTicks.length > 1 ? vTicks[1] - vTicks[0] : 1;
  const vMag = Math.max(...vTicks.map((v) => Math.abs(v)), vStep);
  const vDigits = Math.min(6, Math.max(2, Math.ceil(Math.log10(vMag / vStep)) + 1));
  const tTicks = niceTicks(0, tEnd, Math.max(2, Math.floor(innerW / 110)));

  const scrubTo = (clientX: number) => {
    if (n < 2) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const f = (clientX - r.left - M.left) / innerW;
    setK(Math.round(Math.min(1, Math.max(0, f)) * (n - 1)));
  };

  const t = n > 0 ? sim!.times[Math.min(k, n - 1)] : 0;

  return (
    <section className="time-panel">
      <div
        className="plot"
        ref={wrapRef}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => e.buttons & 1 && scrubTo(e.clientX)}
      >
        <svg width={width} height={PLOT_H}>
          {vTicks.map((v) => (
            <g key={v} className="axis">
              <line x1={M.left} x2={M.left + innerW} y1={yOf(v)} y2={yOf(v)} className={v === 0 ? 'zero' : ''} />
              <text x={M.left - 6} y={yOf(v)} dy="0.35em" textAnchor="end">
                {formatEng(v, 'V', vDigits)}
              </text>
            </g>
          ))}
          {tTicks.map((tt) => (
            <text key={tt} className="axis" x={M.left + (tEnd > 0 ? (tt / tEnd) * innerW : 0)} y={PLOT_H - 5} textAnchor="middle">
              {formatEng(tt, 's', 2)}
            </text>
          ))}
          {paths.map((d, i) => (
            <path key={traces[i].name + i} d={d} className="trace" stroke={traces[i].color} />
          ))}
          {markers.map((m, i) => (
            <g key={i} className="marker">
              <line x1={xOfK(m.k)} x2={xOfK(m.k)} y1={M.top} y2={M.top + innerH} />
              <text x={xOfK(m.k) + 4} y={M.top + 10 + (i % 3) * 12}>
                {m.label}
              </text>
            </g>
          ))}
          {n > 0 && <line className="cursor" x1={xOfK(k)} x2={xOfK(k)} y1={M.top - 4} y2={M.top + innerH + 4} />}
        </svg>
        <div className="legend">
          <span className="legend-title">{tracesTitle}</span>
          {traces.map((tr) => (
            <span key={tr.name} className="legend-item">
              <span className="swatch" style={{ background: tr.color }} />
              {tr.name}
            </span>
          ))}
        </div>
      </div>
      <div className="transport">
        <button className="icon-btn" title="Back to start (Home)" onClick={() => setK(0)}>
          <svg viewBox="0 0 16 16" width={14} height={14}>
            <path d="M3 2v12M13 2L5 8l8 6z" fill="currentColor" stroke="currentColor" />
          </svg>
        </button>
        <button className="icon-btn play" title="Play / pause (Space)" onClick={() => setPlaying(!playing)} disabled={n < 2}>
          {playing ? (
            <svg viewBox="0 0 16 16" width={14} height={14}>
              <path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width={14} height={14}>
              <path d="M4 2l10 6-10 6z" fill="currentColor" />
            </svg>
          )}
        </button>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={Math.min(k, Math.max(0, n - 1))}
          onChange={(e) => setK(Number(e.target.value))}
        />
        <span className="time-readout mono">
          t = {formatEng(t, 's', 4)} <span className="dim">/ {formatEng(tEnd, 's', 3)}</span>
        </span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Playback speed">
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
