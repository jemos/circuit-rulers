// Schematic symbols, drawn in local grid coordinates (pins at ±2).

import type { ComponentKind } from '../model/types';
import type { Waveform } from '../sim/waveforms';

const RESISTOR = 'M0,-2V-1L0.35,-0.833L-0.35,-0.5L0.35,-0.167L-0.35,0.167L0.35,0.5L-0.35,0.833L0,1V2';
const CAPACITOR = 'M0,-2V-0.25M-0.7,-0.25H0.7M-0.7,0.25H0.7M0,0.25V2';
const INDUCTOR =
  'M0,-2V-1a0.25,0.25 0 0 1 0,0.5a0.25,0.25 0 0 1 0,0.5a0.25,0.25 0 0 1 0,0.5a0.25,0.25 0 0 1 0,0.5V2';
const GROUND = 'M0,0V0.5M-0.7,0.5H0.7M-0.45,0.75H0.45M-0.2,1H0.2';

function SourceGlyph({ wave }: { wave?: Waveform }) {
  switch (wave?.type) {
    case 'sine':
      return (
        <>
          <path d="M-0.5,0Q-0.25,-0.55 0,0T0.5,0" />
          <path d="M-0.15,-1.25H0.15M0,-1.4V-1.1" />
        </>
      );
    case 'pulse':
      return (
        <>
          <path d="M-0.5,0.25H-0.25V-0.25H0.1V0.25H0.5" />
          <path d="M-0.15,-1.25H0.15M0,-1.4V-1.1" />
        </>
      );
    case 'step':
      return (
        <>
          <path d="M-0.5,0.25H0V-0.25H0.5" />
          <path d="M-0.15,-1.25H0.15M0,-1.4V-1.1" />
        </>
      );
    default:
      return <path d="M-0.2,-0.4H0.2M0,-0.6V-0.2M-0.2,0.42H0.2" />;
  }
}

export function Symbol({ kind, wave }: { kind: ComponentKind; wave?: Waveform }) {
  switch (kind) {
    case 'resistor':
      return <path d={RESISTOR} />;
    case 'capacitor':
      return <path d={CAPACITOR} />;
    case 'inductor':
      return <path d={INDUCTOR} />;
    case 'vsource':
      return (
        <>
          <path d="M0,-2V-0.85M0,0.85V2" />
          <circle r={0.85} />
          <SourceGlyph wave={wave} />
        </>
      );
    case 'isource':
      return (
        <>
          <path d="M0,-2V-0.85M0,0.85V2" />
          <circle r={0.85} />
          <path d="M0,0.5V-0.45M-0.22,-0.2L0,-0.5L0.22,-0.2" />
        </>
      );
    case 'diode':
      return (
        <>
          <path d="M0,-2V-0.4M0,0.4V2M-0.5,0.4H0.5" />
          <path className="fill" d="M-0.5,-0.4H0.5L0,0.4Z" />
        </>
      );
    case 'npn':
    case 'pnp':
      return (
        <>
          <path d="M-2,0H-0.6M-0.6,-0.75V0.75M-0.6,-0.3L0,-0.85V-2M-0.6,0.3L0,0.85V2" />
          {kind === 'npn' ? (
            <path className="fill" d="M-0.08,0.78L-0.417,0.675L-0.215,0.453Z" />
          ) : (
            <path className="fill" d="M-0.45,0.44L-0.315,0.767L-0.113,0.545Z" />
          )}
        </>
      );
    case 'nmos':
    case 'pmos':
      return (
        <>
          <path
            d={`M-2,0H${kind === 'pmos' ? -1.1 : -0.8}M-0.8,-0.7V0.7M-0.5,-0.85V0.85M-0.5,-0.6H0V-2M-0.5,0.6H0V2M-0.5,0H-0.3`}
          />
          {kind === 'nmos' ? (
            <path className="fill" d="M-0.02,0.6L-0.3,0.43L-0.3,0.77Z" />
          ) : (
            <>
              <path className="fill" d="M-0.48,0.6L-0.2,0.43L-0.2,0.77Z" />
              <circle cx={-0.95} r={0.15} />
            </>
          )}
        </>
      );
    case 'opamp':
      return (
        <>
          <path d="M-1.4,-1.6L1.4,0L-1.4,1.6Z" />
          <path d="M-2,-1H-1.4M-2,1H-1.4M1.4,0H2" />
          <path d="M-1.15,-1H-0.75M-1.15,1H-0.75M-0.95,0.8V1.2" />
        </>
      );
    case 'ground':
      return <path d={GROUND} />;
    case 'label':
      return <path d="M-0.8,0H0.8" />;
  }
}

/** Small standalone icon for toolbars. */
export function SymbolIcon({ kind }: { kind: ComponentKind }) {
  const vb = kind === 'ground' ? '-1.2 -0.6 2.4 2.4' : kind === 'label' ? '-1.2 -1.2 2.4 2.4' : '-2.3 -2.3 4.6 4.6';
  return (
    <svg className="sym icon" viewBox={vb} width={26} height={26}>
      <Symbol kind={kind} />
      {kind === 'label' && (
        <text x={0} y={-0.35} fontSize={0.8} textAnchor="middle" className="icon-text">
          A
        </text>
      )}
    </svg>
  );
}
