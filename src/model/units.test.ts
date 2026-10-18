import { describe, expect, it } from 'vitest';
import { formatEng, formatShort, parseValue } from './units';

describe('parseValue', () => {
  it.each([
    ['10', 10],
    ['4.7k', 4700],
    ['4.7kΩ', 4700],
    ['10u', 10e-6],
    ['10uF', 10e-6],
    ['1F', 1],
    ['1f', 1e-15],
    ['1meg', 1e6],
    ['1M', 1e6],
    ['2m', 2e-3],
    ['5V', 5],
    ['-2.5', -2.5],
    ['1e-3', 1e-3],
    ['.5n', 0.5e-9],
  ])('%s → %d', (text, value) => {
    expect(parseValue(text)).toBeCloseTo(value, 20);
  });

  it('rejects garbage', () => {
    expect(parseValue('abc')).toBeNaN();
    expect(parseValue('')).toBeNaN();
  });
});

describe('formatting', () => {
  it('formats engineering values', () => {
    expect(formatEng(0.00123, 'V')).toBe('1.23 mV');
    expect(formatEng(4700, 'Ω')).toBe('4.70 kΩ');
    expect(formatEng(-3.333, 'V')).toBe('-3.33 V');
    expect(formatEng(0, 'A')).toBe('0 A');
    expect(formatEng(999.99e-6, 'A')).toBe('1.00 mA');
  });

  it('formats short labels', () => {
    expect(formatShort(4700)).toBe('4.7k');
    expect(formatShort(100)).toBe('100');
    expect(formatShort(10e-6)).toBe('10µ');
    expect(formatShort(1e6)).toBe('1M');
  });
});
