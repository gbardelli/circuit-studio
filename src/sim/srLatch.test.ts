import { describe, expect, it } from 'vitest';
import { SimEngine } from './engine';
import type { CircuitSnapshot, WireData } from '../core/types';

const end = (part: string, pin: string) => ({ part, pin, x: 0, y: 0 });
const wire = (id: string, a: [string, string], b: [string, string]): WireData => ({ id, a: end(...a), b: end(...b), points: [], color: '#888' });

// SR con dos NAND de un 74LS00, ambas órdenes inactivas (en 1) al encender: el estado inicial es indefinido.
const latch: CircuitSnapshot = {
  parts: [
    { id: 'uno', type: 'arduino-uno', x: 0, y: 0, rot: 0, props: {} },
    { id: 'u', type: '74ls00', x: 400, y: 0, rot: 0, props: {} },
  ],
  wires: [
    wire('vcc', ['uno', '5V'], ['u', 'VCC']),
    wire('gnd', ['uno', 'GND.1'], ['u', 'GND']),
    wire('set', ['uno', '5V'], ['u', '1A']),
    wire('reset', ['uno', '5V'], ['u', '2A']),
    wire('q', ['u', '1Y'], ['u', '2B']),
    wire('qn', ['u', '2Y'], ['u', '1B']),
  ],
};

describe('latch SR con NAND al encender', () => {
  it('elige un estado y deja avanzar el tiempo con el presupuesto por cuadro del navegador', () => {
    const e = new SimEngine();
    e.update(latch);
    e.start({ manual: true });
    const states: string[] = [];
    for (let frame = 0; frame < 30; frame++) {
      e.stepBudget(1 / 60, 7);
      states.push(`${(e.voltageAt('u', '1Y') ?? 0) > 2 ? 1 : 0}${(e.voltageAt('u', '2Y') ?? 0) > 2 ? 1 : 0}`);
    }
    e.stop();
    expect(e.time).toBeGreaterThan(0.4);
    expect(['10', '01']).toContain(states.at(-1));
    expect(new Set(states.slice(5)).size).toBe(1);
  });
});
