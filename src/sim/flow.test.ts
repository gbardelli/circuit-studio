import { describe, expect, it } from 'vitest';
import type { CircuitSnapshot, PartData, WireData } from '../core/types';
import { PARTS } from '../parts';
import { SimEngine } from './engine';
import { connectionEdges, wireCurrents } from './flow';

const part = (id: string, type: string, props: PartData['props'] = {}, x = 0, y = 0): PartData => ({ id, type, x, y, rot: 0, props });
const wire = (id: string, pa: string, a: string, pb: string, b: string): WireData => ({ id, a: { part: pa, pin: a, x: 0, y: 0 }, b: { part: pb, pin: b, x: 0, y: 0 }, points: [], color: '#000' });

function currents(snap: CircuitSnapshot) {
  const engine = new SimEngine();
  engine.update(snap);
  engine.start({ manual: true });
  engine.tick(0.01);
  return wireCurrents(connectionEdges(snap, PARTS), engine.pinCurrents());
}

describe('corriente por los cables', () => {
  it('pila + resistencia: la misma corriente en ida y vuelta, con su sentido', () => {
    const snap: CircuitSnapshot = {
      parts: [part('bat', 'battery-9v', { voltage: 9 }), part('r', 'resistor', { resistance: 1000 }, 200, 0)],
      wires: [wire('ida', 'bat', '+', 'r', '1'), wire('vuelta', 'r', '2', 'bat', '-')],
    };
    const i = currents(snap);
    const expected = 9 / 1001.5;
    expect(i.get('ida')).toBeCloseTo(expected, 5);
    expect(i.get('vuelta')).toBeCloseTo(expected, 5);
    // Cable dibujado al revés: la corriente sale negativa.
    snap.wires[0] = wire('ida', 'r', '1', 'bat', '+');
    expect(currents(snap).get('ida')).toBeCloseTo(-expected, 5);
  });

  it('LED: el diodo también reparte su corriente', () => {
    const snap: CircuitSnapshot = {
      parts: [part('bat', 'battery-9v', { voltage: 9 }), part('r', 'resistor', { resistance: 330 }, 200, 0), part('led', 'led', {}, 400, 0)],
      wires: [wire('a', 'bat', '+', 'r', '1'), wire('b', 'r', '2', 'led', 'A'), wire('c', 'led', 'K', 'bat', '-')],
    };
    const i = currents(snap);
    expect(i.get('a')!).toBeGreaterThan(0.018);
    expect(i.get('b')).toBeCloseTo(i.get('a')!, 4);
    expect(i.get('c')).toBeCloseTo(i.get('a')!, 4);
  });
});
