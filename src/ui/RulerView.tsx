import { memo } from 'react';
import type { Netlist } from '../model/netlist';
import { RULER_LABEL_W, RULER_LANE_GAP, RULER_LANE_W, RulerLayoutResult, rulerAt, rulerWidth } from '../model/ruler';
import type { Ruler } from '../model/types';
import { formatEng } from '../model/units';
import type { SimResult } from '../sim/simulate';


/** Height reserved for a two-line span label (name + value), in grid units. */
const SPAN_LABEL_H = 1.3;

/** Spread labels apart so they keep at least `gap` between them, staying near their targets. */
function spread(targets: number[], gap: number, min: number, max: number): number[] {
  const order = targets.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
  const ys = order.map(([t]) => t);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  if (ys.length) ys[ys.length - 1] = Math.min(ys[ys.length - 1], max);
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  if (ys.length && ys[0] < min) {
    ys[0] = min;
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  }
  const out = new Array<number>(targets.length);
  order.forEach(([, i], j) => (out[i] = ys[j]));
  return out;
}

interface Props {
  ruler: Ruler;
  result: RulerLayoutResult;
  nl: Netlist;
  sim: SimResult | null;
  k: number;
  time: number;
  lanes: number;
  selected: boolean;
  hoverNet: number | null;
  onHoverNet: (net: number | null) => void;
}

export const RulerView = memo(function RulerView(props: Props) {
  const { ruler, result, nl, sim, k, time, lanes, selected, hoverNet, onHoverNet } = props;
  const { x, y, height: h } = ruler;
  const w = rulerWidth(lanes);
  const pinned = ruler.pinnedTime !== null;

  const frame = (
    <>
      <rect
        className={`ruler-frame${selected ? ' selected' : ''}${pinned ? ' pinned' : ''}`}
        x={x - 0.4}
        y={y - 0.9}
        width={w + 0.8}
        height={h + 1.8}
        rx={0.6}
        data-kind="ruler"
        data-id={ruler.id}
      />
      <text className="ruler-title" x={x + w / 2} y={y - 2.3} textAnchor="middle">
        {ruler.name}
      </text>
      <text className={`ruler-time${pinned ? ' pinned' : ''}`} x={x + w / 2} y={y - 1.35} textAnchor="middle">
        {pinned ? `pinned · t = ${formatEng(time, 's')}` : `live · t = ${formatEng(time, 's')}`}
      </text>
      <rect
        className="ruler-resize"
        x={x + w - 1.6}
        y={y + h + 0.65}
        width={1.4}
        height={0.5}
        rx={0.2}
        data-kind="ruler-resize"
        data-id={ruler.id}
      />
    </>
  );

  if (!result.ok) {
    return (
      <g className="ruler">
        {frame}
        <foreignObject x={x} y={y + h / 2 - 2} width={w} height={4} pointerEvents="none">
          <div className="ruler-error">{result.error}</div>
        </foreignObject>
      </g>
    );
  }

  const { layout } = result;
  const at = rulerAt(layout, nl, sim, k);
  const { vmin, vmax } = layout;
  // Voltages outside the scale are pinned to its edge and flagged with a ▲/▼ marker.
  const offScale = (v: number) => (v > vmax + 1e-9 ? 1 : v < vmin - 1e-9 ? -1 : 0);
  const yOf = (v: number) => y + ((vmax - Math.min(vmax, Math.max(vmin, v))) / (vmax - vmin)) * h;
  const custom = !!ruler.scale;
  const spineX = x + RULER_LABEL_W;
  const laneX = (lane: number) => spineX + RULER_LANE_GAP + lane * RULER_LANE_W;

  const first = layout.nodes[0];
  const last = layout.nodes[layout.nodes.length - 1];
  const yFirst = yOf(at.voltages.get(first.net)!);
  const yLast = yOf(at.voltages.get(last.net)!);
  const ys = layout.nodes.map((n) => yOf(at.voltages.get(n.net)!));
  const nameOf = (net: number) => layout.nodes.find((n) => n.net === net)!.name;

  const nodeY = layout.nodes.map((n) => yOf(at.voltages.get(n.net)!));
  const labelY = spread(nodeY, 0.78, y - 0.3, y + h + 0.3);

  // Span labels: centred beside their bracket when it is tall enough, otherwise pushed
  // aside (spread so labels in a lane never overlap) and tied back with a leader line.
  const spanY = new Array<number>(at.spans.length);
  for (let lane = 0; lane < at.laneCount; lane++) {
    const idx = at.spans.flatMap((sp, i) => (sp.lane === lane ? [i] : []));
    const mids = idx.map((i) => (yOf(at.spans[i].hi) + yOf(at.spans[i].lo)) / 2);
    spread(mids, SPAN_LABEL_H, y - 0.3, y + h + 0.3).forEach((ly, j) => (spanY[idx[j]] = ly));
  }

  return (
    <g className="ruler">
      {frame}
      {/* full-scale track and the 0 V reference */}
      <line className="ruler-track" x1={spineX} x2={spineX} y1={y} y2={y + h} />
      {vmin < 0 && vmax > 0 && (
        <g className="ruler-zero">
          <line x1={spineX - 0.6} x2={x + w} y1={yOf(0)} y2={yOf(0)} />
          <text x={x + w + 0.15} y={yOf(0)} dy="0.35em">
            0
          </text>
        </g>
      )}

      <text className={`ruler-scale${custom ? ' custom' : ''}`} x={spineX + 0.45} y={y - 0.35}>
        {formatEng(vmax, 'V')}
      </text>
      <text className={`ruler-scale${custom ? ' custom' : ''}`} x={spineX + 0.45} y={y + h + 0.75}>
        {formatEng(vmin, 'V')}
      </text>

      {/* spine covering every node on the path, with I-beam caps on the first and last */}
      <line className="ruler-spine" x1={spineX} x2={spineX} y1={Math.min(...ys)} y2={Math.max(...ys)} />
      <line className="ruler-spine" x1={spineX - 0.6} x2={spineX + 0.6} y1={yFirst} y2={yFirst} />
      <line className="ruler-spine" x1={spineX - 0.6} x2={spineX + 0.6} y1={yLast} y2={yLast} />

      {/* spans: voltage from each path node to the next */}
      {at.spans.map((s, i) => {
        const lx = laneX(s.lane);
        const y1 = yOf(s.hi);
        const y2 = yOf(s.lo);
        const mid = (y1 + y2) / 2;
        const ly = spanY[i];
        const fits = y2 - y1 >= SPAN_LABEL_H + 0.05 && ly - SPAN_LABEL_H / 2 >= y1 && ly + SPAN_LABEL_H / 2 <= y2;
        const leader = !fits || Math.abs(ly - mid) > 0.05;
        const tx = lx + (leader ? 0.75 : 0.35);
        const anchorY = Math.min(y2, Math.max(y1, ly));
        const label = s.names.join(' ‖ ');
        const value = formatEng(s.dv, 'V');
        const between = `${nameOf(s.plus)} → ${nameOf(s.minus)}`;
        return (
          <g key={s.key} className="ruler-span">
            <title>{`${label ? `V(${label})` : 'ΔV'} ${between} = ${formatEng(s.dv, 'V', 4)}`}</title>
            <line x1={lx} x2={lx} y1={y1} y2={y2} />
            <line x1={lx - 0.22} x2={lx + 0.22} y1={y1} y2={y1} />
            <line x1={lx - 0.22} x2={lx + 0.22} y1={y2} y2={y2} />
            {leader && <polyline className="ruler-leader" points={`${lx + 0.08},${anchorY} ${lx + 0.4},${ly} ${lx + 0.65},${ly}`} />}
            <text x={tx} y={ly}>
              <tspan className="span-name" x={tx} dy="-0.15em">
                {label ? (
                  <>
                    V<tspan className="sub" dy="0.3em">{label}</tspan>
                  </>
                ) : (
                  'ΔV'
                )}
              </tspan>
              <tspan className="span-value" x={tx} dy={label ? '1.15em' : '1.45em'}>
                {value}
              </tspan>
            </text>
          </g>
        );
      })}

      {/* node ticks and labels */}
      {layout.nodes.map((n, i) => {
        const ny = nodeY[i];
        const ly = labelY[i];
        const hot = hoverNet === n.net;
        const v = at.voltages.get(n.net)!;
        return (
          <g
            key={n.net}
            className={`ruler-node${hot ? ' hot' : ''}`}
            onPointerEnter={() => onHoverNet(n.net)}
            onPointerLeave={() => onHoverNet(null)}
          >
            {n.role === 'mid' && <line className="ruler-tick" x1={spineX - 0.35} x2={spineX + 0.35} y1={ny} y2={ny} />}
            <circle cx={spineX} cy={ny} r={0.17} fill={n.color} />
            {offScale(v) !== 0 && (
              <path
                className="off-scale"
                fill={n.color}
                d={
                  offScale(v) > 0
                    ? `M${spineX},${y - 0.55}l-0.22,0.32h0.44z`
                    : `M${spineX},${y + h + 0.55}l-0.22,-0.32h0.44z`
                }
              >
                <title>{`${n.name} is ${offScale(v) > 0 ? 'above' : 'below'} this ruler's scale`}</title>
              </path>
            )}
            {Math.abs(ly - ny) > 0.05 && (
              <polyline className="ruler-leader" points={`${spineX - 0.75},${ly} ${spineX - 0.45},${ly} ${spineX - 0.2},${ny}`} />
            )}
            <text className="node-label" x={spineX - 0.8} y={ly} dy="0.35em" textAnchor="end">
              <tspan fill={n.color}>{n.name}</tspan>
              <tspan className="node-value"> {formatEng(v, 'V')}</tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
});
