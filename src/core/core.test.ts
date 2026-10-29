import { describe, expect, it } from 'vitest';
import { parseSI, resistorBands, BAND_COLORS } from './units';
import { Circuit, Resistor, VSource, Capacitor, NPN, NMOS } from './solver';
import { buildNetlist, pinKey } from './netlist';
import { PARTS } from '../parts';
import { ledDiode } from '../parts/outputs';
import { AvrRunner } from '../sim/avr';
import type { CircuitSnapshot } from './types';

describe('unidades SI', () => {
  it.each([
    ['220', 220],
    ['4k7', 4700],
    ['10k', 10000],
    ['2.2M', 2.2e6],
    ['1meg', 1e6],
    ['100n', 100e-9],
    ['10uF', 10e-6],
    ['5V', 5],
    ['330Ω', 330],
  ])('%s → %d', (input, expected) => {
    expect(parseSI(input)).toBeCloseTo(expected, 12);
  });
  it('rechaza texto inválido', () => expect(parseSI('abc')).toBeNull());
  it('bandas de 220 Ω: rojo rojo marrón', () => {
    expect(resistorBands(220).slice(0, 3)).toEqual([BAND_COLORS[2], BAND_COLORS[2], BAND_COLORS[1]]);
  });
});

describe('solver MNA', () => {
  it('divisor de tensión', () => {
    // nodo 0 = salida de la fuente, nodo 1 = punto medio
    const c = new Circuit(2, [new VSource(0, -1, () => 10, () => 1e-3), new Resistor(0, 1, () => 1000), new Resistor(1, -1, () => 1000)]);
    const r = c.solve(0);
    expect(r.converged).toBe(true);
    expect(r.v[1]).toBeCloseTo(5, 2);
  });

  it('LED rojo con 220 Ω a 5 V: ~14 mA y Vf ~1.9 V', () => {
    const d = ledDiode(1, -1, 1.9);
    const c = new Circuit(2, [new VSource(0, -1, () => 5, () => 0.05), new Resistor(0, 1, () => 220), d]);
    const r = c.solve(0);
    expect(r.converged).toBe(true);
    const i = d.currentOf(r.v);
    expect(i).toBeGreaterThan(0.012);
    expect(i).toBeLessThan(0.0145);
    expect(r.v[1]).toBeGreaterThan(1.8);
    expect(r.v[1]).toBeLessThan(1.95);
  });

  it('NPN como interruptor: 5 V en base por 1 kΩ satura con carga de 220 Ω', () => {
    // nodos: 0 = 5 V, 1 = base, 2 = colector
    const q = new NPN(2, 1, -1);
    const c = new Circuit(3, [new VSource(0, -1, () => 5, () => 0.01), new Resistor(0, 1, () => 1000), new Resistor(0, 2, () => 220), q]);
    const r = c.solve(0);
    expect(r.converged).toBe(true);
    expect(r.v[1]).toBeGreaterThan(0.6);
    expect(r.v[1]).toBeLessThan(0.85);
    expect(r.v[2]).toBeLessThan(0.3); // saturación: Vce baja
    expect(q.currents(r.v).ic).toBeGreaterThan(0.02);
  });

  it('MOSFET N: con 5 V en puerta conduce un motor de 20 Ω desde 9 V', () => {
    // 0 = 9 V, 1 = puerta, 2 = drenador
    const q = new NMOS(2, 1, -1);
    const c = new Circuit(3, [new VSource(0, -1, () => 9, () => 0.01), new VSource(1, -1, () => 5, () => 25), new Resistor(0, 2, () => 20), q]);
    const r = c.solve(0);
    expect(r.converged).toBe(true);
    expect(q.currentOf(r.v)).toBeGreaterThan(0.43);
    expect(r.v[2]).toBeLessThan(0.1);
  });

  it('MOSFET N: con la puerta a 0 V no conduce', () => {
    const q = new NMOS(2, 1, -1);
    const c = new Circuit(3, [new VSource(0, -1, () => 9, () => 0.01), new VSource(1, -1, () => 0, () => 25), new Resistor(0, 2, () => 20), q]);
    const r = c.solve(0);
    expect(Math.abs(q.currentOf(r.v))).toBeLessThan(1e-6);
    expect(r.v[2]).toBeGreaterThan(8.9);
  });

  it('carga RC: tras τ el condensador alcanza ~63 %', () => {
    const cap = new Capacitor(1, -1, () => 100e-6);
    const c = new Circuit(2, [new VSource(0, -1, () => 5, () => 1e-3), new Resistor(0, 1, () => 1000), cap]);
    const dt = 1e-4;
    for (let t = 0; t < 0.1 - 1e-12; t += dt) c.solve(dt);
    expect(c.v[1] / 5).toBeGreaterThan(0.61);
    expect(c.v[1] / 5).toBeLessThan(0.65);
  });
});

describe('redes y protoboard', () => {
  const snap: CircuitSnapshot = {
    parts: [
      { id: 'bb', type: 'breadboard-half', x: 0, y: 0, rot: 0, props: { cols: 30 } },
      // Resistencia de la columna 1 (x=30) a la 5 (x=70) en la fila a (y=60)
      { id: 'r1', type: 'resistor', x: 30, y: 60, rot: 0, props: { resistance: 220 } },
      // LED con cátodo en la columna 6 y ánodo en la 5, fila b
      { id: 'd1', type: 'led', x: 80, y: 70, rot: 180, props: { color: 'red' } },
    ],
    wires: [],
  };
  it('las patillas insertadas comparten red con la tira de 5 orificios', () => {
    const n = buildNetlist(snap, PARTS);
    expect(n.netOf.get(pinKey('r1', '2'))).toBe(n.netOf.get(pinKey('bb', 'e5')));
    expect(n.netOf.get(pinKey('d1', 'A'))).toBe(n.netOf.get(pinKey('r1', '2')));
    expect(n.netOf.get(pinKey('d1', 'K'))).toBe(n.netOf.get(pinKey('bb', 'a6')));
    expect(n.netOf.get(pinKey('bb', 'a1'))).not.toBe(n.netOf.get(pinKey('bb', 'f1')));
  });
  it('los rieles son continuos', () => {
    const n = buildNetlist(snap, PARTS);
    expect(n.netOf.get(pinKey('bb', 'tp1'))).toBe(n.netOf.get(pinKey('bb', 'tp29')));
  });
});

describe('avr8js', () => {
  it('un programa que pone D13 en alto cambia el modo del pin', () => {
    // ldi r16,0x20 ; out DDRB,r16 ; out PORTB,r16 ; rjmp .-2
    const program = new Uint16Array(0x4000);
    program.set([0xe200, 0xb904, 0xb905, 0xcfff]);
    const avr = new AvrRunner(program);
    expect(avr.pinMode(13)).toBe('input');
    avr.run(100);
    avr.run(200);
    expect(avr.pinMode(13)).toBe('high');
  });
});
