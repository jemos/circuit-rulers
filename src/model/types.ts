import type { SimSettings } from '../sim/simulate';
import type { Waveform } from '../sim/waveforms';

/** A point on the schematic grid (grid units, y grows downwards). */
export interface Pt {
  x: number;
  y: number;
}

export type Rot = 0 | 1 | 2 | 3; // quarter turns clockwise

export type ComponentKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'vsource'
  | 'isource'
  | 'diode'
  | 'npn'
  | 'pnp'
  | 'nmos'
  | 'pmos'
  | 'opamp'
  | 'ground'
  | 'label';

export interface Component {
  id: string;
  kind: ComponentKind;
  name: string;
  x: number;
  y: number;
  rot: Rot;
  flip: boolean; // mirror across the local y axis, applied before rotation
  params: Record<string, number>;
  wave?: Waveform; // sources only
  text?: string; // net labels only
}

export interface Wire {
  id: string;
  a: Pt;
  b: Pt;
}

export interface Ruler {
  id: string;
  name: string;
  /** Grid points identifying the nodes the ruler measures, in the order they were clicked. */
  path: Pt[];
  /** Position of the ruler's frame on the canvas (top-left, grid units). */
  x: number;
  y: number;
  height: number;
  /** null → follows the time scrubber; otherwise frozen at this time (seconds). */
  pinnedTime: number | null;
  /** Custom voltage scale; absent → the whole circuit's min…max over the run. */
  scale?: { min: number; max: number };
}

export interface Doc {
  version: 1;
  components: Component[];
  wires: Wire[];
  rulers: Ruler[];
  /** Nodes plotted as auxiliary traces, as grid points like ruler paths. */
  probes: Pt[];
  sim: SimSettings;
  nextId: number;
}

export const ptKey = (p: Pt) => `${p.x},${p.y}`;
export const ptEq = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
