import { useEffect, useState } from 'react';
import { KINDS } from '../model/kinds';
import type { Netlist } from '../model/netlist';
import { componentReadout } from '../model/readout';
import { transistorRegion } from '../model/regions';
import { netAt } from '../model/netlist';
import { circuitRange, componentsBetween, NODE_COLORS, RulerLayoutResult, VoltRange } from '../model/ruler';
import { Component, Doc, Ruler } from '../model/types';
import { formatEng, formatShort, parseValue } from '../model/units';
import type { SimResult } from '../sim/simulate';
import { defaultWaveform, Waveform } from '../sim/waveforms';
import type { DocHistory } from './useDocHistory';

function NumField(props: { value: number; unit: string; onCommit: (v: number) => void; min?: number; integer?: boolean }) {
  const { value, unit, onCommit, min, integer } = props;
  const show = (v: number) => (integer ? String(v) : formatShort(v) + unit);
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const commit = () => {
    const v = parseValue(text);
    if (!Number.isFinite(v) || (min !== undefined && v <= min)) {
      setBad(true);
      return;
    }
    setBad(false);
    const final = integer ? Math.round(v) : v;
    if (final !== value) onCommit(final);
    setText(show(final));
  };
  return (
    <input
      className={`num${bad ? ' bad' : ''}`}
      value={text}
      spellCheck={false}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onChange={(e) => {
        setText(e.target.value);
        setBad(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(show(value));
          setBad(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function TextField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      value={text}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() && text !== value && onCommit(text.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="row">
      <span>{label}</span>
      {children}
    </label>
  );
}

const WAVE_FIELDS: Record<Waveform['type'], [string, string, 'amp' | 's' | 'Hz' | '°'][]> = {
  dc: [['value', 'Value', 'amp']],
  step: [
    ['v1', 'Initial', 'amp'],
    ['v2', 'Final', 'amp'],
    ['delay', 'Step at', 's'],
    ['rise', 'Rise time', 's'],
  ],
  pulse: [
    ['v1', 'Low', 'amp'],
    ['v2', 'High', 'amp'],
    ['delay', 'Delay', 's'],
    ['rise', 'Rise time', 's'],
    ['fall', 'Fall time', 's'],
    ['width', 'High for', 's'],
    ['period', 'Period', 's'],
  ],
  sine: [
    ['offset', 'Offset', 'amp'],
    ['amplitude', 'Amplitude', 'amp'],
    ['freq', 'Frequency', 'Hz'],
    ['delay', 'Delay', 's'],
    ['phase', 'Phase', '°'],
  ],
};

const WAVE_NAMES: Record<Waveform['type'], string> = { dc: 'DC', step: 'Step', pulse: 'Pulse', sine: 'Sine' };

function ComponentInspector(props: { c: Component; history: DocHistory; nl: Netlist; sim: SimResult | null; k: number }) {
  const { c, history, nl, sim, k } = props;
  const def = KINDS[c.kind];
  const edit = (fn: (c: Component) => void) =>
    history.commit((d) => {
      const target = d.components.find((x) => x.id === c.id);
      if (target) fn(target);
    });
  const amp = c.kind === 'isource' ? 'A' : 'V';
  const readout = componentReadout(c, nl, sim, k);
  const region = transistorRegion(c, nl, sim, k);
  return (
    <>
      <h3>{def.title}</h3>
      {c.kind === 'label' ? (
        <Row label="Net name">
          <TextField value={c.text ?? ''} onCommit={(v) => edit((x) => (x.text = v))} />
        </Row>
      ) : (
        c.kind !== 'ground' && (
          <Row label="Name">
            <TextField value={c.name} onCommit={(v) => edit((x) => (x.name = v))} />
          </Row>
        )
      )}
      {def.fields.map((f) => (
        <Row key={f.key} label={f.label}>
          <NumField value={c.params[f.key]} unit={f.unit} min={f.min} onCommit={(v) => edit((x) => (x.params[f.key] = v))} />
        </Row>
      ))}
      {c.wave && (
        <>
          <Row label="Waveform">
            <select
              value={c.wave.type}
              onChange={(e) => {
                const type = e.target.value as Waveform['type'];
                const w = c.wave!;
                const level = w.type === 'dc' ? w.value : w.type === 'sine' ? w.amplitude : w.v2;
                edit((x) => (x.wave = defaultWaveform(type, level || (c.kind === 'isource' ? 1e-3 : 5))));
              }}
            >
              {Object.entries(WAVE_NAMES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Row>
          {WAVE_FIELDS[c.wave.type].map(([key, label, unit]) => (
            <Row key={key} label={label}>
              <NumField
                value={(c.wave as unknown as Record<string, number>)[key]}
                unit={unit === 'amp' ? amp : unit}
                min={key === 'freq' || key === 'period' ? 0 : key === 'width' || key === 'rise' || key === 'fall' || key === 'delay' ? -1e-30 : undefined}
                onCommit={(v) => edit((x) => ((x.wave as unknown as Record<string, number>)[key] = v))}
              />
            </Row>
          ))}
        </>
      )}
      <div className="buttons">
        <button onClick={() => edit((x) => (x.rot = ((x.rot + 1) % 4) as Component['rot']))}>Rotate (R)</button>
        <button onClick={() => edit((x) => (x.flip = !x.flip))}>Flip (F)</button>
      </div>
      {readout.length > 0 && (
        <>
          <h4>At t = {formatEng(sim?.times[Math.min(k, (sim?.times.length ?? 1) - 1)] ?? 0, 's')}</h4>
          <div className="readout">
            {readout.map((l) => (
              <div key={l.label} className="readout-row">
                <span>{l.label}</span>
                <span className={l.label === 'Region' && region ? `region-badge region-${region.role}` : 'mono'}>{l.value}</span>
              </div>
            ))}
          </div>
          {region && <p className="note">{region.why}</p>}
        </>
      )}
    </>
  );
}

/** A range with a little headroom, rounded to 3 significant digits so it reads well. */
function paddedRange(r: VoltRange): VoltRange {
  const span = Math.max(r.max - r.min, 1e-3);
  const min = r.min - span * 0.05;
  const max = r.max + span * 0.05;
  const round = (v: number) => Number(v.toPrecision(3));
  return round(min) < round(max) ? { min: round(min), max: round(max) } : { min, max };
}

function RulerInspector(props: {
  r: Ruler;
  doc: Doc;
  result: RulerLayoutResult | undefined;
  history: DocHistory;
  nl: Netlist;
  sim: SimResult | null;
  time: number;
  onSnapshot: () => void;
  onRepick: () => void;
}) {
  const { r, doc, result, history, nl, sim, time, onSnapshot, onRepick } = props;
  const edit = (fn: (r: Ruler) => void) =>
    history.commit((d) => {
      const target = d.rulers.find((x) => x.id === r.id);
      if (target) fn(target);
    });
  const nets = r.path.map((p) => netAt(nl, doc.wires, p));
  const layout = result?.ok ? result.layout : null;
  const circuit = circuitRange(sim);
  return (
    <>
      <h3>Voltage ruler</h3>
      <Row label="Name">
        <TextField value={r.name} onCommit={(v) => edit((x) => (x.name = v))} />
      </Row>

      <h4>Path</h4>
      <ol className="path-list">
        {r.path.map((_, i) => {
          const net = nets[i];
          const next = nets[i + 1];
          const between =
            net !== undefined && next !== undefined ? componentsBetween(doc, nl, net, next).join(' ‖ ') : '';
          return (
            <li key={i}>
              <div className="path-node">
                <span className="swatch" style={{ background: NODE_COLORS[i % NODE_COLORS.length] }} />
                <span className="mono">{net !== undefined ? nl.nets[net].name : 'detached'}</span>
                <button
                  className="mini"
                  title="Remove this node from the path"
                  disabled={r.path.length <= 2}
                  onClick={() => edit((x) => x.path.splice(i, 1))}
                >
                  ×
                </button>
              </div>
              {i < r.path.length - 1 && <div className="path-edge">↓ {between || 'ΔV'}</div>}
            </li>
          );
        })}
      </ol>
      <div className="buttons">
        <button onClick={onRepick} title="Click a new sequence of nodes for this ruler">
          Re-pick path
        </button>
        <button onClick={() => edit((x) => x.path.reverse())}>Reverse</button>
      </div>

      <h4>Scale</h4>
      <Row label="Range">
        <select
          value={r.scale ? 'custom' : 'circuit'}
          onChange={(e) =>
            edit((x) => {
              if (e.target.value === 'circuit') delete x.scale;
              else x.scale = paddedRange(layout?.path ?? circuit);
            })
          }
        >
          <option value="circuit">Whole circuit</option>
          <option value="custom">Custom</option>
        </select>
      </Row>
      {r.scale ? (
        <>
          <Row label="Maximum">
            <NumField
              value={r.scale.max}
              unit="V"
              onCommit={(v) => edit((x) => x.scale && v > x.scale.min && (x.scale.max = v))}
            />
          </Row>
          <Row label="Minimum">
            <NumField
              value={r.scale.min}
              unit="V"
              onCommit={(v) => edit((x) => x.scale && v < x.scale.max && (x.scale.min = v))}
            />
          </Row>
          <div className="buttons">
            {layout && (
              <button onClick={() => edit((x) => (x.scale = paddedRange(layout.path)))} title="Zoom the scale to this path's voltages over the run">
                Fit to path
              </button>
            )}
            <button onClick={() => edit((x) => (x.scale = { ...circuit }))}>Reset to circuit</button>
          </div>
        </>
      ) : (
        <p className="note">
          {formatEng(circuit.min, 'V')} … {formatEng(circuit.max, 'V')}: the lowest and highest voltage anywhere in the circuit
          during the run.
        </p>
      )}

      <h4>Time</h4>
      {r.pinnedTime === null ? (
        <>
          <p className="note">Follows the time scrubber.</p>
          <div className="buttons">
            <button onClick={() => edit((x) => (x.pinnedTime = time))}>Pin here ({formatEng(time, 's')})</button>
            <button className="primary" onClick={onSnapshot} title="Add a frozen copy of this ruler at the current time (P)">
              Snapshot (P)
            </button>
          </div>
        </>
      ) : (
        <>
          <Row label="Pinned at">
            <NumField value={r.pinnedTime} unit="s" min={-1e-30} onCommit={(v) => edit((x) => (x.pinnedTime = v))} />
          </Row>
          <div className="buttons">
            <button onClick={() => edit((x) => (x.pinnedTime = time))}>Move pin to {formatEng(time, 's')}</button>
            <button onClick={() => edit((x) => (x.pinnedTime = null))}>Follow scrubber</button>
          </div>
        </>
      )}
      {result && !result.ok && <p className="error">{result.error}</p>}
    </>
  );
}

function SimInspector({ doc, history, nl, sim }: { doc: Doc; history: DocHistory; nl: Netlist; sim: SimResult | null }) {
  const edit = (fn: (d: Doc) => void) => history.commit(fn);
  return (
    <>
      <h3>Simulation</h3>
      <Row label="Duration">
        <NumField value={doc.sim.stopTime} unit="s" min={0} onCommit={(v) => edit((d) => (d.sim.stopTime = v))} />
      </Row>
      <Row label="Time steps">
        <NumField
          value={doc.sim.steps}
          unit=""
          integer
          min={1}
          onCommit={(v) => edit((d) => (d.sim.steps = Math.min(20000, Math.max(2, v))))}
        />
      </Row>
      <Row label="Start from">
        <select value={doc.sim.start} onChange={(e) => edit((d) => (d.sim.start = e.target.value as 'dc' | 'zero'))}>
          <option value="dc">DC operating point</option>
          <option value="zero">Initial conditions (C, L at IC)</option>
        </select>
      </Row>
      <Row label="Integration">
        <select value={doc.sim.method} onChange={(e) => edit((d) => (d.sim.method = e.target.value as 'trap' | 'be'))}>
          <option value="trap">Trapezoidal</option>
          <option value="be">Backward Euler</option>
        </select>
      </Row>
      <p className="note">Step size {formatEng(doc.sim.stopTime / doc.sim.steps, 's')}.</p>
      {nl.warnings.map((w) => (
        <p key={w} className="warning">
          {w}
        </p>
      ))}
      {sim?.error && <p className="error">Simulation stopped: {sim.error}</p>}

      <h3>How to</h3>
      <ul className="help">
        <li>Pick a part on the left, click to place it. <kbd>R</kbd> rotates, <kbd>F</kbd> flips.</li>
        <li>
          <kbd>W</kbd> draws wires: click corners, finish on a pin or wire.
        </li>
        <li>
          <kbd>U</kbd> adds a voltage ruler: click the nodes to measure in order (e.g. Vdd, the middle
          node, GND), then <kbd>Enter</kbd> or double-click the last one.
        </li>
        <li>
          Drag the time bar (or <kbd>Space</kbd> to play, <kbd>←</kbd> <kbd>→</kbd> to step). Live rulers follow it.
        </li>
        <li>
          Select a ruler and press <kbd>P</kbd> to freeze a snapshot of it at the current time, for comparison.
        </li>
        <li>Scroll to pan, pinch or ⌘/Ctrl + scroll to zoom, middle-drag to pan.</li>
      </ul>
    </>
  );
}

export function Inspector(props: {
  doc: Doc;
  history: DocHistory;
  selection: Set<string>;
  nl: Netlist;
  sim: SimResult | null;
  k: number;
  time: number;
  rulerResults: Map<string, RulerLayoutResult>;
  onSnapshot: (rulerId: string) => void;
  onRepick: (rulerId: string) => void;
  onDelete: () => void;
}) {
  const { doc, history, selection, nl, sim, k, time, rulerResults, onSnapshot, onRepick, onDelete } = props;
  const ids = [...selection];
  let body: React.ReactNode;
  if (ids.length === 0) {
    body = <SimInspector doc={doc} history={history} nl={nl} sim={sim} />;
  } else if (ids.length > 1) {
    body = <h3>{ids.length} items selected</h3>;
  } else {
    const id = ids[0];
    const c = doc.components.find((x) => x.id === id);
    const r = doc.rulers.find((x) => x.id === id);
    const w = doc.wires.find((x) => x.id === id);
    if (c) body = <ComponentInspector key={c.id} c={c} history={history} nl={nl} sim={sim} k={k} />;
    else if (r)
      body = (
        <RulerInspector
          key={r.id}
          r={r}
          doc={doc}
          result={rulerResults.get(r.id)}
          history={history}
          nl={nl}
          sim={sim}
          time={time}
          onSnapshot={() => onSnapshot(r.id)}
          onRepick={() => onRepick(r.id)}
        />
      );
    else if (w) {
      const net = nl.wireNets.get(w.id);
      body = (
        <>
          <h3>Wire</h3>
          <Row label="Net">
            <span className="mono">{net !== undefined ? nl.nets[net].name : '—'}</span>
          </Row>
        </>
      );
    }
  }
  return (
    <aside className="inspector">
      {body}
      {ids.length > 0 && (
        <div className="buttons danger-row">
          <button className="danger" onClick={onDelete}>
            Delete (⌫)
          </button>
        </div>
      )}
    </aside>
  );
}
