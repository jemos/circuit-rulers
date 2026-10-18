# Circuit Rulers

An interactive schematic editor for building intuition about analog circuits.
Draw a circuit, scrub through time, and place **voltage rulers** next to the
schematic. You build a ruler by clicking a path of nodes (e.g. Vdd → middle →
GND). It shows where each of those nodes sits and the voltage from each node to
the next, at the current moment.

Rulers are **live** (they follow the time scrubber) or **pinned** to a moment.
Put a pinned ruler next to a live one to see how the voltages shift over time.

Everything runs in the browser: a small SPICE-like simulator, the editor and
the visualisation. There is no backend.

## Run

Requires Node 18+.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # solver, model and example tests (vitest)
npm run typecheck  # tsc, no emit
npm run build      # static build in dist/
```

## Using it

| Action | How |
| --- | --- |
| Place a part | Pick it in the left toolbar, click on the canvas. `R` rotates, `F` flips. |
| Wire | `W`, click corners, click a pin or a wire to finish (`Esc` stops). |
| Voltage ruler | `U`, click the nodes in order, then `Enter`, double-click the last node, or right-click. `⌫` undoes the last click, `Esc` cancels. |
| Change a ruler's path | Select it: remove nodes, **Reverse**, or **Re-pick path** in the inspector. |
| Extra plot trace | `T`, click a node to add it to the plot, click it again to remove. Or use **+ trace** in the plot legend. |
| Snapshot a ruler | Select it, press `P`: a pinned copy at the current time appears. |
| Time | Drag the scrubber or the plot, `Space` play/pause, `←`/`→` step (`⇧` ×10). |
| Edit values | Select a part; values accept engineering notation (`4.7k`, `10u`, `1meg`). |
| Select | Click, `⇧`-click to add, drag on empty canvas for a box, `⌘A` for all. |
| View | Scroll to pan, pinch or `⌘`/`Ctrl`+scroll to zoom, middle-drag to pan, **Fit**. |
| Undo | `⌘Z` / `⇧⌘Z` |

The circuit autosaves to local storage. **Save**/**Open** read and write JSON files.

### Voltage rulers

- **Spine:** runs through the clicked nodes, with I-beam caps on the first and
  last. By default the scale is the **whole circuit's** range over the run
  (lowest to highest node voltage, GND included), so a path in the middle of the
  circuit appears at its true height and all rulers share one scale.
- **Custom scale:** for small differences, set the scale to **Custom** in the
  inspector and enter a min and max, or use **Fit to path**. Nodes outside a
  custom range sit at the edge with a ▲/▼ marker.
- **Nodes:** each node on the path gets a tick, its name and its voltage.
- **Steps:** each step of the path gets a bracket labelled with the component
  between those two nodes (V<sub>R1</sub>, V<sub>Q1 CE</sub>, …), or ΔV when no
  single part connects them.
  - Values are signed in path order, so a reversed voltage (like an inductor
    ringing) shows as negative and moves to an outer lane.
  - A bracket too short for its label gets a leader line.

### Currents, transistor regions and the plot

Orange arrows on the part leads show the direction of conventional current,
scaled by its size.

Each transistor is labelled with its **operating region** at the current time
(toggle **Transistor regions** in the top bar). Colours follow the region's role,
so the two device types line up despite the clash of names:

| Colour | Role | BJT | MOSFET |
| --- | --- | --- | --- |
| green | amplifying | forward active | saturation |
| amber | fully on (switch) | saturation | triode |
| grey | off | cutoff | cutoff |
| purple | backwards | reverse active | — |

How the region is decided:

- **BJT:** the base–emitter junction counts as on above 0.5 V, and the
  base–collector junction above 0.4 V. With both on, the transistor is saturated
  (V<sub>CE</sub> below about 0.3 V).
- **MOSFET:** V<sub>GS</sub> is compared with V<sub>th</sub>, and V<sub>DS</sub>
  with V<sub>GS</sub> − V<sub>th</sub>.

The inspector and hover tooltip show the voltages and the rule that decided it.

The plot at the bottom shows the selected ruler's nodes over the whole run, with
the time cursor and pinned rulers marked. Click or drag on it to scrub.

Probed nodes are drawn as fainter extra traces under the ruler's, whichever
ruler is selected, and count towards the plot's vertical range. Remove one with
its **×** in the legend. Probes are saved with the circuit.

## Examples

Load these from the **Examples** menu, where they're grouped by kind. Each
comes with rulers already placed.

| Example | What to look at |
| --- | --- |
| **Basics** | |
| Voltage divider | The ruler from the original sketch: R2 and R1 split Vdd in a fixed ratio. |
| RC charging (default) | At the step all of Vin drops across R1, then moves onto C1. |
| RLC ringing | The capacitor overshoots Vin while L1's voltage reverses. |
| Half-wave rectifier | D1 conducts only near the peaks, and C1 holds the output up in between. |
| **BJT stages** | |
| Common-emitter amplifier | A small base wiggle swings the collector by about Rc/Re. |
| Common emitter, bypassed Re | Same bias, but Ce shorts Re for the signal: gain ≈ Rc/re ≈ 250, already distorting at 10 mV. |
| Common base | The emitter barely moves, so Rs carries all of Vin and its current goes to the collector. |
| Emitter follower | Vbe stays near 0.7 V while the emitter current changes sevenfold. |
| Current mirror | RL's drop holds still while Vsweep moves, until Q2 saturates at the dip. |
| Differential amplifier | A long-tailed pair. The floating Vo1 → Vo2 output is on a zoomed scale. |
| **MOSFET stages** | |
| CMOS inverter | One transistor is off while the other is in triode. Mid-ramp, both conduct. |
| Common source | Gain ≈ gm·RD, with the drain swinging further down than up (square law). |
| Source follower | Unlike the emitter follower, Vgs grows visibly with the current. |
| Common gate | The MOS common base: 1/gm is large, so the source moves with Vin. |
| Cascode | M2 holds M1's drain near 2 V while the output swings by volts. |
| CMOS differential pair | An NMOS pair with a PMOS mirror load and a single-ended output. |
| **Output & multi-stage** | |
| Loaded vs buffered stage | Two CE stages drive 1 kΩ, one directly and one through an emitter follower. |
| Push-pull output stage | Class B: the output stalls while \|Vin\| < 0.6 V (crossover distortion). |
| **Op-amp circuits** | |
| Inverting op-amp | The − input stays at virtual ground, and the output clips at the rails. |
| Non-inverting op-amp | V− tracks Vin, and Rf and Rg split Vout 2:1. |
| Summing amplifier | The currents through R1 and R2 add at the virtual ground. |
| Op-amp integrator | A square wave in becomes a triangle out as C1 charges at a constant current. |
| High-side current sense | A tiny floating shunt drop near 12 V, amplified ×20 down to ground. |

## Simulator

`src/sim` is a small SPICE-like engine using modified nodal analysis:

- **Transient analysis:** runs on a fixed time grid with trapezoidal
  integration, using backward Euler on the first step. A step that fails to
  converge is subdivided automatically.
- **Nonlinear parts:** solved with Newton–Raphson, using pn-junction voltage
  limiting and source stepping for hard operating points.
- **Starting point:** either the DC operating point, or the initial conditions
  on the capacitors and inductors (zero unless set).

| Part | Model |
| --- | --- |
| R, C, L | ideal; C and L take an initial condition |
| V / I sources | DC, step, pulse, sine |
| Diode | Shockley (Is, n) |
| NPN / PNP | Ebers–Moll transport (Is, βF, βR) |
| NMOS / PMOS | Shichman–Hodges level 1 (Vth, β = k′W/L, λ), body tied to source |
| Op-amp | ideal inputs, gain A with a smooth tanh limit at the rails |

## Project layout

```
src/sim/      solver: device models and stamps, LU solve, transient analysis
src/model/    schematic data, netlist extraction, rulers, regions, edits, examples
src/ui/       React components: canvas, symbols, rulers, inspector, time panel
src/App.tsx   app state, keyboard shortcuts, file I/O, playback
```

See [AGENTS.md](AGENTS.md) for architecture notes and conventions when working
on the code.

## About

This project was AI-generated: written with [Claude Code](https://claude.com/claude-code)
from an idea and a hand-drawn sketch, then refined through review.
