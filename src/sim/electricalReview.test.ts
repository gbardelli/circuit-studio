import { describe, expect, it } from 'vitest';
import { electricalReview } from './electricalReview';
import { electricalChecks } from './diagnostics';
import type { CircuitSnapshot } from '../core/types';

const circuit: CircuitSnapshot = { parts: [
  { id: 'r', type: 'resistor', x: 0, y: 0, rot: 0, props: { resistance: 100, power: .25 } },
  { id: 'c', type: 'capacitor', x: 100, y: 0, rot: 0, props: { voltage: 16 } },
  { id: 'u', type: '74hc08', x: 200, y: 0, rot: 0, props: {} },
], wires: [] };
describe('electrical operating-point review', () => {
  it('calculates resistor power and detects reversed or overvoltage capacitors', () => {
    let rows = electricalReview(circuit, { 'r:1': 6, 'r:2': 0, 'c:+': 0, 'c:-': 3.3 }, new Map()).rows;
    expect(rows.find(r => r.part === 'r')).toMatchObject({ value: .36, limit: .25, state: 'error' });
    expect(rows.find(r => r.part === 'c')).toMatchObject({ value: -3.3, state: 'error' });
    rows = electricalReview(circuit, { 'c:+': 17, 'c:-': 0 }, new Map()).rows;
    expect(rows[0]).toMatchObject({ value: 17, state: 'error' });
  });
  it('does not fabricate readings and distinguishes design budgets from ratings', () => {
    expect(electricalReview(circuit, {}, new Map()).rows).toEqual([]);
    const rows = electricalReview(circuit, {}, new Map([['u:1Y', -.004]])).rows;
    expect(rows[0]).toMatchObject({ value: .004, limit: .002, state: 'warning' });
    expect(rows[0].basis).toContain('Objetivo de diseño');
  });
  it('flags CMOS hardware margins even when the behavioral model reads HIGH', () => {
    const result = electricalChecks(circuit, { 'u:VCC': 5, 'u:GND': 0, 'u:1A': 3.3 });
    expect(result.some(r => r.pin === '1A' && r.title === 'Margen CMOS por verificar')).toBe(true);
  });
});
