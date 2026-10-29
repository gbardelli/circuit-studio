import { describe, expect, it } from 'vitest';
import type { CircuitSnapshot, PartData, Props } from '../core/types';
import { PARTS } from '../parts';
import { SimEngine } from './engine';

function part(id: string, type: string, x: number, props: Props = {}): PartData {
  return { id, type, x, y: 0, rot: 0, props: { ...PARTS[type].defaults, ...props } };
}
function circuit(parts: PartData[], links: [string, string, string, string][]): CircuitSnapshot {
  return { parts, wires: links.map(([a, ap, b, bp], i) => ({ id: `w${i}`, a: { part: a, pin: ap, x: 0, y: 0 }, b: { part: b, pin: bp, x: 0, y: 0 }, color: '#000', points: [], sch: true })) };
}

describe('scheduled digital simulation', () => {
  it('preserves a 10 kHz clock after topology is rebuilt while simulation is running', () => {
    const snap = circuit([
      part('supply', 'bench-supply', 1000),
      part('clock', 'clock', 2000, { frequency: 10000, duty: 50 }),
      part('meter', 'multimeter', 3000),
    ], [['supply', '-', 'clock', 'GND'], ['meter', 'COM', 'clock', 'GND'], ['meter', 'IN', 'clock', 'OUT']]);
    const engine = new SimEngine();
    engine.update(snap);
    engine.start({ manual: true });
    engine.tick(0.002);
    expect(Number(engine.getVisual('meter')?.v)).toBeCloseTo(2.5, 1);
    engine.update({ ...snap, parts: snap.parts.map((p) => p.id === 'meter' ? { ...p, x: p.x + 100 } : p) });
    engine.tick(0.002);
    expect(Number(engine.getVisual('meter')?.v)).toBeCloseTo(2.5, 1);
    expect(engine.status.converged).toBe(true);
    engine.stop();
  });

  it('runs a 555 astable oscillator with its external resistors and capacitor', () => {
    const snap = circuit([
      part('source', 'bench-supply', 1000), part('timer', 'ne555', 2000),
      part('r1', 'resistor', 3000, { resistance: 1000 }),
      part('r2', 'resistor', 4000, { resistance: 10000 }),
      part('cap', 'capacitor', 5000, { capacitance: 1e-6 }),
    ], [
      ['source', '+', 'timer', 'VCC'], ['source', '-', 'timer', 'GND'],
      ['timer', 'RESET', 'timer', 'VCC'], ['r1', '1', 'timer', 'VCC'],
      ['r1', '2', 'timer', 'DIS'], ['r2', '1', 'timer', 'DIS'],
      ['r2', '2', 'timer', 'THR'], ['timer', 'THR', 'timer', 'TRIG'],
      ['cap', '+', 'timer', 'THR'], ['cap', '-', 'timer', 'GND'],
    ]);
    const engine = new SimEngine();
    engine.update(snap);
    engine.start({ manual: true });
    const samples: number[] = [];
    for (let i = 0; i < 80; i++) {
      engine.tick(0.001);
      samples.push(engine.voltageAt('timer', 'OUT')!);
    }
    expect(Math.min(...samples)).toBeLessThan(0.1);
    expect(Math.max(...samples)).toBeGreaterThan(4.5);
    expect(samples.filter((v, i) => i > 0 && (v > 2.5) !== (samples[i - 1] > 2.5)).length).toBeGreaterThan(4);
    expect(engine.status.converged).toBe(true);
    engine.stop();
  });
});
