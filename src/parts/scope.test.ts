import { describe, expect, it } from 'vitest';
import type { CircuitSnapshot, PartData, WireData } from '../core/types';
import { SimEngine } from '../sim/engine';
import { Capture, measureFrequency, triggerStart } from './scope';

const part = (id: string, type: string, props: PartData['props'] = {}): PartData => ({ id, type, x: 0, y: 0, rot: 0, props });
const wire = (id: string, pa: string, a: string, pb: string, b: string): WireData => ({ id, a: { part: pa, pin: a, x: 0, y: 0 }, b: { part: pb, pin: b, x: 0, y: 0 }, points: [], color: '#000' });

describe('osciloscopio', () => {
  it('dispara en el flanco de subida y deja una pantalla completa detrás', () => {
    const cap = new Capture();
    for (let i = 0; i < 400; i++) cap.push(i * 1e-4, Math.floor(i / 10) % 2 ? 5 : 0, 0, 1);
    const start = triggerStart(cap, 0.01, 400 * 1e-4, 2.5)!;
    expect(start - 0.001).toBeGreaterThanOrEqual(cap.t[0]);
    expect(start).not.toBeNull();
    expect(cap.at(cap.a, start - 1e-5)).toBe(0);
    expect(cap.at(cap.a, start + 1e-5)).toBe(5);
    expect(measureFrequency(cap, 2.5)).toBeCloseTo(500, 0);
  });

  it('ve la onda del generador de reloj con su frecuencia y amplitud', () => {
    const snap: CircuitSnapshot = {
      parts: [part('clk', 'clock', { frequency: 1000, duty: 50 }), part('osc', 'oscilloscope', { timebase: 0.0005, volts1: 2, volts2: 2, trigger: 'auto' })],
      wires: [wire('a', 'clk', 'OUT', 'osc', 'CH1'), wire('b', 'clk', 'GND', 'osc', 'GND')],
    };
    const engine = new SimEngine();
    let visual: Record<string, unknown> = {};
    engine.subscribePart('osc', () => (visual = (engine as unknown as { visuals: Map<string, Record<string, unknown>> }).visuals.get('osc')!));
    engine.update(snap);
    engine.start({ manual: true });
    for (let i = 0; i < 10; i++) engine.tick(0.005);
    expect(Number(visual.freq)).toBeCloseTo(1000, -1);
    expect(Number(visual.vpp)).toBeGreaterThan(4.9);
    expect(visual.trig).toBe(true);
    const trace = String(visual.a).split(' ').map(Number);
    // Una división antes del disparo la señal está baja; justo después, alta.
    expect(trace[Math.floor(240 * 0.1) - 2]).toBeLessThan(0.5);
    expect(trace[Math.floor(240 * 0.1) + 2]).toBeGreaterThan(4.5);
    expect(Math.max(...trace)).toBeGreaterThan(4.9);
  });
});
