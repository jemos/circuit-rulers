// Engineering-notation parsing and formatting ("4.7k", "10u", "1meg").

const SUFFIX: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  meg: 1e6,
  Meg: 1e6,
  MEG: 1e6,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

const NUMBER_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(meg|Meg|MEG|[fpnuµmkKMGT])?\s*([a-zA-ZΩ]*)\s*$/;

/** Parse a value like "4.7k", "10uF", "1meg", "-2.5". Returns NaN when invalid. */
export function parseValue(text: string): number {
  const m = NUMBER_RE.exec(text);
  if (!m) return NaN;
  // Prefixes are case-sensitive so "1F" is a farad and "1M" is mega (unlike SPICE).
  const base = parseFloat(m[1]);
  return m[2] ? base * SUFFIX[m[2]] : base;
}

const PREFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
];

/** Format with engineering prefix and `digits` significant digits: 0.00123 → "1.23 m". */
export function formatEng(value: number, unit = '', digits = 3): string {
  if (!Number.isFinite(value)) return `— ${unit}`.trim();
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(value);
  let [scale, prefix] = PREFIXES[PREFIXES.length - 1];
  for (const p of PREFIXES) {
    if (abs >= p[0] * 0.9995) {
      [scale, prefix] = p;
      break;
    }
  }
  const scaled = value / scale;
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(scaled))) + 1);
  const decimals = Math.max(0, digits - intDigits);
  const s = scaled.toFixed(decimals);
  return `${s} ${prefix}${unit}`.trim();
}

/** Compact value for component labels: "4.7k", "10µ", "1M". */
export function formatShort(value: number): string {
  const s = formatEng(value, '', 3);
  return s
    .replace(/(\.\d*?)0+(?=\s|$)/, '$1')
    .replace(/\.(?=\s|$)/, '')
    .replace(' ', '');
}
