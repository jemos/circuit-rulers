import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isDoc, nextRulerName } from './model/doc';
import { EXAMPLES } from './model/examples';
import { componentBounds, rotateCW } from './model/geometry';
import { KINDS, PALETTE } from './model/kinds';
import { buildNetlist } from './model/netlist';
import { netPoint, probeNets, toggleProbe } from './model/probes';
import { arrangeRulers, layoutRuler, maxLanes, NODE_COLORS, RulerLayoutResult, rulerWidth } from './model/ruler';
import { Doc, Pt } from './model/types';
import { simulate } from './sim/simulate';
import { Canvas, newRulerFrame, RulerInfo, Tool, View } from './ui/Canvas';
import { Inspector } from './ui/Inspector';
import { SymbolIcon } from './ui/Symbol';
import { Marker, TimePanel, Trace } from './ui/TimePanel';
import { useDocHistory } from './ui/useDocHistory';
import { formatEng } from './model/units';

const STORAGE_KEY = 'circuit-rulers:doc';
const PLAY_SECONDS = 8; // a full run plays in this many seconds at 1×

function loadInitial(): Doc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (isDoc(d)) return d;
    }
  } catch {
    // ignore unreadable storage
  }
  return buildExample('rc');
}

function buildExample(id: string): Doc {
  const doc = EXAMPLES.find((e) => e.id === id)!.build();
  const nl = buildNetlist(doc);
  arrangeRulers(doc, nl, simulate(nl.sim, doc.sim));
  return doc;
}

function docBounds(doc: Doc, rulers: Map<string, RulerInfo>) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of doc.components) {
    const b = componentBounds(c);
    xs.push(b.x1, b.x2);
    ys.push(b.y1, b.y2);
  }
  for (const w of doc.wires) {
    xs.push(w.a.x, w.b.x);
    ys.push(w.a.y, w.b.y);
  }
  for (const r of doc.rulers) {
    xs.push(r.x - 4, r.x + rulerWidth(rulers.get(r.id)?.lanes ?? 1) + 1);
    ys.push(r.y - 3, r.y + r.height + 1.5);
  }
  if (!xs.length) return null;
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
}

/** Rotate (or flip) components in place. Wires stay put, like most schematic editors. */
function transformComponents(d: Doc, ids: Set<string>, op: 'rotate' | 'flip') {
  for (const c of d.components) {
    if (!ids.has(c.id)) continue;
    if (op === 'rotate') c.rot = rotateCW(c.rot);
    else c.flip = !c.flip;
  }
}

export default function App() {
  const history = useDocHistory(loadInitial);
  const { doc } = history;
  const [tool, setTool] = useState<Tool>({ type: 'select' });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ x: 80, y: 80, zoom: 22 });
  const [k, setKRaw] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hoverNet, setHoverNet] = useState<number | null>(null);
  const [showCurrents, setShowCurrents] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [pending, setPending] = useState<Pt | null>(null);
  const [rulerPath, setRulerPath] = useState<Pt[]>([]);
  useEffect(() => setRulerPath([]), [tool]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- derived: netlist, simulation, rulers ---------------------------------
  const nl = useMemo(() => buildNetlist(doc), [doc.components, doc.wires]);
  const simKey = JSON.stringify([nl.sim, doc.sim]);
  const { sim, simMs } = useMemo(() => {
    const t0 = performance.now();
    const sim = nl.sim.elements.length ? simulate(nl.sim, doc.sim) : null;
    return { sim, simMs: performance.now() - t0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simKey]);
  const n = sim?.times.length ?? 0;
  const kc = Math.min(k, Math.max(0, n - 1));
  const time = n ? sim!.times[kc] : 0;
  const setK = useCallback((v: number) => setKRaw(Math.max(0, Math.round(v))), []);

  const indexOfTime = useCallback(
    (t: number) => {
      if (!sim || n < 2) return 0;
      const h = sim.times[1] - sim.times[0];
      return Math.min(n - 1, Math.max(0, Math.round(t / h)));
    },
    [sim, n],
  );

  const rulerLayouts = useMemo(() => {
    const m = new Map<string, { result: RulerLayoutResult; lanes: number }>();
    for (const r of doc.rulers) {
      const result = layoutRuler(r, doc, nl, sim);
      m.set(r.id, { result, lanes: result.ok ? maxLanes(result.layout, nl, sim) : 1 });
    }
    return m;
  }, [doc, nl, sim]);

  const rulers = useMemo(() => {
    const m = new Map<string, RulerInfo>();
    for (const r of doc.rulers) {
      const l = rulerLayouts.get(r.id)!;
      m.set(r.id, { ...l, k: r.pinnedTime === null ? kc : indexOfTime(r.pinnedTime) });
    }
    return m;
  }, [doc.rulers, rulerLayouts, kc, indexOfTime]);

  // The ruler the plot and wire colours follow: the selected one, else the first.
  const focusRuler = doc.rulers.find((r) => selection.has(r.id)) ?? doc.rulers[0];
  const focusLayout = focusRuler ? rulerLayouts.get(focusRuler.id)?.result : undefined;
  const selectedRuler = doc.rulers.find((r) => selection.has(r.id));

  const netColors = useMemo(() => {
    const m = new Map<number, string>();
    const res = selectedRuler ? rulerLayouts.get(selectedRuler.id)?.result : undefined;
    if (res?.ok) for (const node of res.layout.nodes) if (!nl.nets[node.net].isGround) m.set(node.net, node.color);
    return m;
  }, [selectedRuler, rulerLayouts, nl]);

  const probed = useMemo(() => probeNets(doc, nl), [doc.probes, doc.wires, nl]);

  // Probed nets in colours the focused ruler isn't using; a net on the ruler keeps the ruler's colour.
  const probeColors = useMemo(() => {
    const m = new Map<number, string>();
    const nodes = focusLayout?.ok ? focusLayout.layout.nodes : [];
    const free = [...NODE_COLORS].reverse().filter((c) => !nodes.some((node) => node.color === c));
    let j = 0;
    for (const net of probed) {
      const own = nodes.find((node) => node.net === net)?.color;
      m.set(net, own ?? (free.length ? free[j++ % free.length] : NODE_COLORS[0]));
    }
    return m;
  }, [probed, focusLayout]);

  const traces: Trace[] = useMemo(() => {
    if (!sim) return [];
    const out: Trace[] = [];
    const add = (net: number, color: string, aux = false) => {
      const node = nl.nets[net]?.node ?? -1;
      if (node < 0) return;
      out.push({ net, name: nl.nets[net].name, color, values: sim.nodeV[node], aux });
    };
    if (focusLayout?.ok) for (const node of focusLayout.layout.nodes) add(node.net, node.color);
    for (const net of probed) add(net, probeColors.get(net)!, true);
    if (hoverNet !== null && !out.some((t) => t.net === hoverNet)) add(hoverNet, '#ffffff');
    if (!out.length) nl.nets.slice(0, 6).forEach((net, i) => add(net.index, NODE_COLORS[i % NODE_COLORS.length]));
    return out;
  }, [sim, nl, focusLayout, probed, probeColors, hoverNet]);

  const auxOptions = useMemo(
    () => nl.nets.filter((net) => net.node >= 0 && !probed.includes(net.index)).map((net) => ({ net: net.index, name: net.name })),
    [nl, probed],
  );

  const toggleAux = useCallback(
    (net: number) => {
      const p = netPoint(nl, net);
      if (p) history.commit((d) => toggleProbe(d, nl, p));
    },
    [nl, history],
  );

  const markers: Marker[] = useMemo(
    () =>
      doc.rulers
        .filter((r) => r.pinnedTime !== null)
        .map((r) => ({ label: r.name, k: indexOfTime(r.pinnedTime!) })),
    [doc.rulers, indexOfTime],
  );

  // --- persistence ------------------------------------------------------------
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      } catch {
        // storage full or unavailable: nothing to do
      }
    }, 300);
    return () => clearTimeout(id);
  }, [doc]);

  // --- playback ------------------------------------------------------------------
  const pos = useRef(0);
  useEffect(() => {
    if (!playing || n < 2) return;
    pos.current = kc >= n - 1 ? 0 : kc;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      pos.current += ((now - last) / 1000) * ((n - 1) / PLAY_SECONDS) * speed;
      last = now;
      if (pos.current >= n - 1) {
        setKRaw(n - 1);
        setPlaying(false);
        return;
      }
      setKRaw(Math.floor(pos.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, n, speed]);

  // --- actions -------------------------------------------------------------------
  const fitView = useCallback(
    (d: Doc = doc) => {
      const el = canvasRef.current;
      const b = docBounds(d, rulers);
      if (!el || !b) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const zoom = Math.max(8, Math.min(40, Math.min((W - 60) / (b.x2 - b.x1), (H - 60) / (b.y2 - b.y1))));
      setView({ zoom, x: (W - (b.x1 + b.x2) * zoom) / 2, y: (H - (b.y1 + b.y2) * zoom) / 2 });
    },
    [doc, rulers],
  );

  // Fit once after the first layout.
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) {
      fitted.current = true;
      fitView();
    }
  }, [fitView]);

  const loadDoc = (d: Doc) => {
    history.replace(d);
    setSelection(new Set());
    setTool({ type: 'select' });
    setPending(null);
    setPlaying(false);
    setKRaw(0);
    fitted.current = false; // refit on next render, once ruler widths are known
  };

  const deleteSelection = useCallback(() => {
    if (!selection.size) return;
    history.commit((d) => {
      d.components = d.components.filter((c) => !selection.has(c.id));
      d.wires = d.wires.filter((w) => !selection.has(w.id));
      d.rulers = d.rulers.filter((r) => !selection.has(r.id));
    });
    setSelection(new Set());
  }, [selection, history]);

  const snapshot = useCallback(
    (rulerId: string) => {
      const src = doc.rulers.find((r) => r.id === rulerId);
      if (!src) return;
      const id = `e${doc.nextId}`;
      const right = Math.max(...doc.rulers.map((r) => r.x + rulerWidth(rulers.get(r.id)?.lanes ?? 1)));
      history.commit((d) => {
        d.nextId++;
        d.rulers.push({
          ...structuredClone(src),
          id,
          name: nextRulerName(d),
          x: Math.ceil(right) + 3,
          pinnedTime: time,
        });
      });
      setSelection(new Set([id]));
    },
    [doc, rulers, history, time],
  );

  /** Turn the clicked ruler path into a new ruler, or into the path of the ruler being edited. */
  const finishRuler = useCallback(() => {
    if (tool.type !== 'ruler' || rulerPath.length < 2) return;
    const path = rulerPath;
    const editId = tool.editId;
    if (editId) {
      history.commit((d) => {
        const r = d.rulers.find((r) => r.id === editId);
        if (r) r.path = path;
      });
      setSelection(new Set([editId]));
    } else {
      const frame = newRulerFrame(doc, rulers);
      const id = `e${doc.nextId}`;
      history.commit((d) => {
        d.nextId++;
        d.rulers.push({ id, name: nextRulerName(d), path, ...frame, pinnedTime: null });
      });
      setSelection(new Set([id]));
    }
    setTool({ type: 'select' });
  }, [tool, rulerPath, history, doc, rulers]);

  // --- keyboard ------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea')) {
        if (e.key === 'Escape') el.blur();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        history.redo();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        setSelection(new Set([...doc.components, ...doc.wires, ...doc.rulers].map((x) => x.id)));
        return;
      }
      if (mod) return;
      switch (key) {
        case 'enter':
          if (tool.type === 'ruler') finishRuler();
          break;
        case 'escape':
          if (pending) setPending(null);
          else if (tool.type === 'ruler' && rulerPath.length) setRulerPath([]);
          else if (tool.type !== 'select') setTool({ type: 'select' });
          else setSelection(new Set());
          break;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          if (tool.type === 'ruler') setRulerPath(rulerPath.slice(0, -1));
          else deleteSelection();
          break;
        case 'r':
        case 'f':
          if (tool.type === 'place') {
            setTool(key === 'r' ? { ...tool, rot: rotateCW(tool.rot) } : { ...tool, flip: !tool.flip });
          } else {
            const ids = new Set(doc.components.filter((c) => selection.has(c.id)).map((c) => c.id));
            if (ids.size) history.commit((d) => transformComponents(d, ids, key === 'r' ? 'rotate' : 'flip'));
          }
          break;
        case 'w':
          setPending(null);
          setTool({ type: 'wire' });
          break;
        case 'u':
          setPending(null);
          setTool({ type: 'ruler' });
          break;
        case 't':
          setPending(null);
          setTool({ type: 'probe' });
          break;
        case 'v':
        case 's':
          setPending(null);
          setTool({ type: 'select' });
          break;
        case 'p': {
          const r = selectedRuler ?? doc.rulers.find((r) => r.pinnedTime === null);
          if (r) snapshot(r.id);
          break;
        }
        case ' ':
          e.preventDefault();
          setPlaying(!playing);
          break;
        case 'arrowleft':
        case 'arrowright': {
          e.preventDefault();
          const step = (e.shiftKey ? 10 : 1) * (key === 'arrowleft' ? -1 : 1);
          setPlaying(false);
          setKRaw(Math.min(Math.max(0, n - 1), Math.max(0, kc + step)));
          break;
        }
        case 'home':
          setKRaw(0);
          break;
        case 'end':
          setKRaw(Math.max(0, n - 1));
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, doc, tool, pending, rulerPath, finishRuler, selection, selectedRuler, deleteSelection, snapshot, playing, n, kc]);

  // --- file I/O --------------------------------------------------------------------
  const saveFile = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'circuit.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const openFile = async (file: File) => {
    try {
      const d = JSON.parse(await file.text());
      if (!isDoc(d)) throw new Error('not a circuit file');
      loadDoc(d);
    } catch (err) {
      alert(`Could not open ${file.name}: ${(err as Error).message}`);
    }
  };

  const toolBtn = (t: Tool, title: string, icon: React.ReactNode, active: boolean) => (
    <button
      key={title}
      className={`tool${active ? ' active' : ''}`}
      title={title}
      onClick={() => {
        setPending(null);
        setTool(t);
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 20 20" width={18} height={18}>
            <path d="M6 3h4M8 3v14M6 17h4M14 3v14M12 9h4" stroke="currentColor" strokeWidth={1.6} fill="none" />
          </svg>
          Circuit Rulers
        </div>
        <select
          className="examples"
          value=""
          onChange={(e) => {
            if (e.target.value) loadDoc(buildExample(e.target.value));
          }}
        >
          <option value="" disabled>
            Examples…
          </option>
          {EXAMPLES.map((ex) => (
            <option key={ex.id} value={ex.id} title={ex.blurb}>
              {ex.title}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            loadDoc({ version: 1, components: [], wires: [], rulers: [], probes: [], sim: { ...doc.sim }, nextId: 1 })
          }
        >
          New
        </button>
        <button onClick={() => fileRef.current?.click()}>Open</button>
        <button onClick={saveFile}>Save</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openFile(f);
            e.target.value = '';
          }}
        />
        <span className="sep" />
        <button onClick={history.undo} disabled={!history.canUndo} title="Undo (⌘Z)">
          Undo
        </button>
        <button onClick={history.redo} disabled={!history.canRedo} title="Redo (⇧⌘Z)">
          Redo
        </button>
        <button onClick={() => fitView()} title="Fit everything in view">
          Fit
        </button>
        <label className="toggle">
          <input type="checkbox" checked={showCurrents} onChange={(e) => setShowCurrents(e.target.checked)} />
          Current arrows
        </label>
        <label className="toggle" title="Label each transistor with its operating region at the current time">
          <input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} />
          Transistor regions
        </label>
        <span className="spacer" />
        <span className={`sim-status${sim?.error ? ' error' : ''}`}>
          {sim?.error
            ? `⚠ ${sim.error}`
            : sim
              ? `${n - 1} steps of ${formatEng(doc.sim.stopTime / doc.sim.steps, 's')} · ${simMs.toFixed(0)} ms`
              : 'Empty circuit'}
        </span>
      </header>

      <nav className="toolbar">
        {toolBtn(
          { type: 'select' },
          'Select / move (V)',
          <svg viewBox="0 0 16 16" width={18} height={18}>
            <path d="M3 2l9 6-4 1 2.5 4.5-1.8 1L6.3 10 3 13z" fill="currentColor" />
          </svg>,
          tool.type === 'select',
        )}
        {toolBtn(
          { type: 'wire' },
          'Wire (W)',
          <svg viewBox="0 0 16 16" width={18} height={18}>
            <path d="M2 13h6V3h6" stroke="currentColor" strokeWidth={1.6} fill="none" />
            <circle cx={2} cy={13} r={1.6} fill="currentColor" />
            <circle cx={14} cy={3} r={1.6} fill="currentColor" />
          </svg>,
          tool.type === 'wire',
        )}
        {toolBtn(
          { type: 'ruler' },
          'Voltage ruler (U): click the nodes to measure, in order; Enter to finish',
          <svg viewBox="0 0 16 16" width={18} height={18}>
            <path d="M5 2h6M8 2v12M5 14h6M6.5 9h3" stroke="currentColor" strokeWidth={1.6} fill="none" />
          </svg>,
          tool.type === 'ruler',
        )}
        {toolBtn(
          { type: 'probe' },
          'Probe (T): click a node to add or remove it as an extra trace in the plot',
          <svg viewBox="0 0 16 16" width={18} height={18}>
            <path d="M2 14l3.5-3.5M4.5 8.5l3 3L14 5l-3-3z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" fill="none" />
          </svg>,
          tool.type === 'probe',
        )}
        <div className="toolbar-sep" />
        {PALETTE.map((kind) =>
          toolBtn(
            { type: 'place', kind, rot: 0, flip: false },
            KINDS[kind].title,
            <SymbolIcon kind={kind} />,
            tool.type === 'place' && tool.kind === kind,
          ),
        )}
      </nav>

      <main className="stage" ref={canvasRef}>
        <Canvas
          history={history}
          nl={nl}
          sim={sim}
          k={kc}
          selection={selection}
          setSelection={setSelection}
          tool={tool}
          setTool={setTool}
          view={view}
          setView={setView}
          hoverNet={hoverNet}
          setHoverNet={setHoverNet}
          rulers={rulers}
          netColors={netColors}
          probeColors={probeColors}
          showCurrents={showCurrents}
          showRegions={showRegions}
          pending={pending}
          setPending={setPending}
          rulerPath={rulerPath}
          setRulerPath={setRulerPath}
          finishRuler={finishRuler}
        />
      </main>

      <Inspector
        doc={doc}
        history={history}
        selection={selection}
        nl={nl}
        sim={sim}
        k={kc}
        time={time}
        rulerResults={new Map([...rulerLayouts].map(([id, l]) => [id, l.result]))}
        onSnapshot={snapshot}
        onRepick={(id) => {
          setPending(null);
          setTool({ type: 'ruler', editId: id });
        }}
        onDelete={deleteSelection}
      />

      <TimePanel
        sim={sim}
        k={kc}
        setK={(v) => {
          setPlaying(false);
          setK(v);
        }}
        playing={playing}
        setPlaying={setPlaying}
        speed={speed}
        setSpeed={setSpeed}
        traces={traces}
        tracesTitle={focusRuler ? focusRuler.name : 'Nodes'}
        markers={markers}
        auxOptions={auxOptions}
        onToggleAux={toggleAux}
      />
    </div>
  );
}
