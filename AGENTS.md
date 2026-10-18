# AGENTS.md

Guidance for AI coding agents (and humans) working on **Circuit Rulers**. Read
[README.md](README.md) first for what the app does from a user's point of view.

## Purpose

The goal is building intuition for how analog circuits behave over time. The
core idea comes from the owner's hand-drawn sketch:

- A time scrubber walks through a transient simulation.
- **Voltage rulers** drawn beside the schematic show node voltages and
  per-component drops: an I-beam spine with ticks at the nodes.
- A ruler can be pinned at a moment and compared with a live one.

Visual clarity and correctness of the physics matter more than feature count.
When a request is ambiguous, ask before building. The owner prefers clarifying
questions up front.

## Commands

```sh
npm install
npm run dev        # Vite dev server (default port 5173)
npm test           # vitest, all *.test.ts under src/
npm run typecheck  # tsc -b --noEmit (strict, noUnusedLocals/Parameters)
npm run build      # tsc -b && vite build → dist/
./deploy.sh        # build and publish to https://circuits.jemos.net (see Deploying)
```

Before considering a change done, run `npm run typecheck`, `npm test` and
`npm run build`.

## Deploying

The site is hosted on Cloudflare as a Workers static-assets project named
`circuit-rulers`. There is no CI/CD, deliberately: the repo is public, so
deploys are manual and on demand from the owner's machine. Don't add workflow
files, and don't deploy unless asked.

- **`wrangler.jsonc`** sets the Worker name, serves `dist/` as static assets,
  and attaches the `circuits.jemos.net` custom domain. Keep secrets and the
  account id out of it.
- **`deploy.sh`** runs `npm ci`, the typecheck, tests and build, then
  `wrangler deploy` with the commit hash and subject as the version message.
  - It asks before deploying while tracked files have uncommitted changes.
  - `--skip-checks` skips the typecheck and tests.
  - Wrangler runs through `npx` at a pinned version. It isn't a project
    dependency.
- **Auth** is the browser login from `npx wrangler@<pinned> login`. If
  `CLOUDFLARE_API_TOKEN` is set in the shell, wrangler uses it instead, and
  the deploy fails with "No access" unless the token has Workers permissions.
- **Don't use `wrangler pages`.** New Pages projects get redirected to Workers,
  and `pages project create` fails without a Workers config.

## Architecture

Stack: TypeScript, React 18, Vite, with the schematic rendered as SVG. There is
no backend and no state library. Data flows one way:

```
Doc (model/types.ts)                 the saved document: components, wires, rulers, probes, sim settings
  └─ buildNetlist (model/netlist.ts) union-find over grid points → nets, pin→net map, SimInput
       └─ simulate (sim/simulate.ts) DC op point + fixed-grid transient → SimResult
            ├─ layoutRuler / rulerAt (model/ruler.ts)   what each ruler shows at time index k
            ├─ transistorRegion (model/regions.ts)      operating region at k
            └─ componentReadout (model/readout.ts)      tooltip/inspector numbers at k
```

- **`src/sim/` is independent of the UI and the schematic model.**
  - `devices.ts` holds the device models and their MNA stamps.
  - `linalg.ts` is a dense LU solve.
  - `simulate.ts` runs Newton, source stepping, step subdivision and recording.
- **`src/model/` is pure TypeScript with no React.**
  - `kinds.ts` holds the static per-component data: pins, defaults, editable
    fields, label anchor, and ruler `spans`.
  - `geometry.ts` handles transforms, `edit.ts` handles move/route edits,
    `doc.ts` has the `DocBuilder` and load validation/migration, and
    `examples.ts` has the built-in circuits.
- **`src/ui/`** holds the React components.
  - `Canvas.tsx` handles all pointer interaction and SVG rendering.
  - `useDocHistory.ts` provides undo/redo, and `Inspector.tsx`,
    `TimePanel.tsx` and `RulerView.tsx` cover the panels and rulers.
  - `About.tsx` is the About dialog, opened from the top bar.
- **`public/docs/`** is the user documentation: hand-written static HTML pages
  sharing `docs.css`, copied as-is into `dist/docs/`. Links are relative and
  extensionless (`rulers`, not `rulers.html`). Cloudflare's asset serving
  resolves them, and a small middleware in `vite.config.ts` does the same in dev.
  The sidebar nav is repeated in every page, so update all of them when adding
  a page.
- **`src/App.tsx`** owns UI state (tool, selection, view, time index, playback),
  derived data (netlist, sim, ruler layouts), keyboard shortcuts and file I/O.

The simulation is memoised on `JSON.stringify([nl.sim, doc.sim])`, so moving
parts without changing connectivity doesn't re-simulate.

## Conventions

- **Coordinates are grid units with y pointing down.** One grid unit is drawn
  at `view.zoom` px.
- **Symbols are drawn in local coordinates.**
  - Two-terminal parts have their pins at (0, −2) and (0, +2), with the first
    pin as "+".
  - Transistor pins are ordered [C, B, E] or [D, G, S].
  - Op-amp pins are ordered [−, +, out].
- **`rot` is clockwise quarter turns, and `flip` mirrors x before rotation.**
  `toWorld` in `geometry.ts` and `transformAttr` must stay consistent with each
  other.
- **The MNA sign conventions are documented at the top of `sim/devices.ts`.**
  - Node −1 is ground.
  - `pinCurrents` returns the current flowing *into* the device at each pin.
  - A current source pushes current out of its + pin.
- **Ids are `e<n>`, taken from `doc.nextId`.** To know a new item's id before
  committing, read `doc.nextId` first and increment it inside the commit (see
  the ruler creation and snapshot code). React state updaters run lazily, so
  don't capture values assigned inside them.
- **Edits go through `useDocHistory`.**
  - Use `commit(mutate)` for a discrete edit.
  - Use `gesture(mutate)`/`endGesture()` for drags. Every gesture call
    re-applies the mutation to the document as it was when the drag started,
    and the whole drag is one undo step.
  - Updaters must be pure: StrictMode calls them twice.
- **Document format:** `version: 1`. `isDoc()` in `doc.ts` validates loaded
  files and migrates older shapes in place (e.g. rulers with `top`/`bottom` →
  `path`, dropping zero-length wires). Keep old saved files loading.
- **Probes** (`doc.probes`, `model/probes.ts`) are grid points resolved with
  `netAt`, like ruler paths. They're one list for the whole document, plotted
  as faint aux traces. `applyMove` carries them along with moved pins.
- **Ruler spans and scale:**
  - A ruler is an ordered `path` of grid points, each resolved to a net with
    `netAt`.
  - Spans are only drawn between consecutive path nodes.
  - The scale is `ruler.scale`, falling back to `circuitRange(sim)`.
- **Engineering units:** `parseValue`/`formatEng`/`formatShort` live in
  `model/units.ts`. Prefixes are case-sensitive: `m` is milli, `M` and `meg`
  are mega, and `1F` is a farad.
- **Styling:** dark theme via CSS variables in `src/styles.css`. Strokes use
  `vector-effect: non-scaling-stroke`. Match the existing code style: 2-space
  indent, single quotes, few comments, and those only for non-obvious
  reasoning.

## Recipes

**Add a component kind:**

1. Add it to the `ComponentKind` union in `types.ts`.
2. Add its entry in `KINDS` and `PALETTE` (`kinds.ts`): pins, params, fields,
   `labelAt`, `spans`. Add `valueText` if it shows a value.
3. Draw it in `ui/Symbol.tsx`.
4. Map it to an `ElementSpec` in `elementFor` (`netlist.ts`).
5. If it needs a new device model, add the spec type, a class with
   `stamp`/`accept`/`pinCurrents`, and a `createDevice` case in
   `sim/devices.ts`.
6. Add solver tests against an analytic result in `sim/simulate.test.ts`.

**Add an example:**

1. Build it with `DocBuilder` in `model/examples.ts`. Check every pin
   coordinate against `kinds.ts`. Give it a `group` from `EXAMPLE_GROUPS`,
   which sets its section in the menu; `rail()` draws a DC supply.
2. Rulers are re-laid-out left to right when an example loads
   (`arrangeRulers`), so only the first ruler's x matters.
3. The generic test in `model.test.ts` checks that every example simulates
   with no warnings and lays out its rulers. Also add a test that checks the
   physics you want the example to show.

## Gotchas already hit (don't reintroduce)

- **Zero-length wires** draw as a huge round cap, because a non-scaling stroke
  doesn't apply to a degenerate line. `applyMove` drops them, `isDoc` cleans
  them on load, and the canvas skips them.
- **Rotate/flip don't move wires** (LTspice-style): connectivity is by position.
  Rubber-banding on rotate shorted parts after two 90° turns.
- **Dragging a part off a touching pin** adds stretch wires (`applyMove`) so the
  connection survives.
- **Text selection** while dragging, which Safari showed: the app sets
  `-webkit-user-select`/`user-select: none`, the canvas `preventDefault`s
  mousedown, and `onPointerDown` blurs the focused input first so an unsaved
  inspector value commits before the click changes the selection and unmounts
  the field.
- **Op-amp Newton convergence:** a saturated tanh output can oscillate
  rail-to-rail under feedback. The limiting in `OpAmp.stamp` restarts from the
  linear region. Keep it if you touch the model.
- **Transistor region thresholds** are textbook constants in
  `model/regions.ts`: BJT junction on at 0.5 V (BE) and 0.4 V (BC).

## Verifying UI changes

Unit tests cover the solver and model. For UI behaviour, the approach used so
far is driving the dev server with **puppeteer-core** and the locally installed
Google Chrome, then inspecting screenshots and DOM state.

- Install puppeteer-core in a scratch directory outside the repo. It is
  deliberately not a project dependency.
- Useful selectors:
  - `svg.canvas > g`: its `transform` gives `translate(x y) scale(zoom)` for
    grid → screen mapping.
  - `button.tool[title^="Resistor"]` for toolbar tools.
  - `select.examples` for the examples menu.
  - `input.scrubber` for the time scrubber.
  - `g.comp .hit` for parts, `rect.ruler-frame` for rulers, `.inspector` for
    the side panel.
- Clear `localStorage` before each run, because the app autosaves.
- The screenshots and clips in `public/docs/media/` were made this way, at a
  1440×900 viewport. Stills are 2× WebP; clips are CDP screencast frames
  encoded as animated WebP with Pillow (there's no ffmpeg). Headless captures
  show no pointer, so the clips use an injected fake cursor. Recapture the
  affected media when the UI changes visibly.
- The left toolbar and bottom panel cover parts of the canvas. Pan, or pick
  grid points that land inside the visible canvas.
