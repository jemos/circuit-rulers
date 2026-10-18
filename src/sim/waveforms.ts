// Time-dependent source values.

export type Waveform =
  | { type: 'dc'; value: number }
  | { type: 'step'; v1: number; v2: number; delay: number; rise: number }
  | {
      type: 'pulse';
      v1: number;
      v2: number;
      delay: number;
      rise: number;
      fall: number;
      width: number;
      period: number;
    }
  | { type: 'sine'; offset: number; amplitude: number; freq: number; delay: number; phase: number };

export function waveformAt(w: Waveform, t: number): number {
  switch (w.type) {
    case 'dc':
      return w.value;
    case 'step': {
      if (t <= w.delay) return w.v1;
      if (w.rise > 0 && t < w.delay + w.rise) return w.v1 + ((w.v2 - w.v1) * (t - w.delay)) / w.rise;
      return w.v2;
    }
    case 'pulse': {
      if (t <= w.delay) return w.v1;
      let tp = t - w.delay;
      if (w.period > 0) tp %= w.period;
      const { rise, fall, width } = w;
      if (tp < rise) return w.v1 + ((w.v2 - w.v1) * tp) / rise;
      if (tp < rise + width) return w.v2;
      if (tp < rise + width + fall) return w.v2 + ((w.v1 - w.v2) * (tp - rise - width)) / fall;
      return w.v1;
    }
    case 'sine': {
      if (t <= w.delay) return w.offset + w.amplitude * Math.sin((w.phase * Math.PI) / 180);
      return (
        w.offset + w.amplitude * Math.sin(2 * Math.PI * w.freq * (t - w.delay) + (w.phase * Math.PI) / 180)
      );
    }
  }
}

export function defaultWaveform(type: Waveform['type'], amplitude = 5): Waveform {
  switch (type) {
    case 'dc':
      return { type: 'dc', value: amplitude };
    case 'step':
      return { type: 'step', v1: 0, v2: amplitude, delay: 1e-3, rise: 0 };
    case 'pulse':
      return { type: 'pulse', v1: 0, v2: amplitude, delay: 0, rise: 0, fall: 0, width: 5e-3, period: 10e-3 };
    case 'sine':
      return { type: 'sine', offset: 0, amplitude, freq: 100, delay: 0, phase: 0 };
  }
}
