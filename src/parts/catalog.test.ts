import { describe, expect, it } from 'vitest';
import { Circuit, Resistor, VSource } from '../core/solver';
import type { PartData, Props } from '../core/types';
import { PARTS, PART_LIST } from './index';
import { CHIPS } from './chips';
import { SimEngine } from '../sim/engine';

/** Exercise the electrical model, not a duplicate of each chip's logic function. */
function fixture(type: string, inputs: Record<string, number>, loads: Record<string, number> = {}) {
  const def = PARTS[type];
  const ground = def.ground?.[0] ?? def.reference;
  let count = 0;
  const nodes = new Map(def.pins(def.defaults).map((p) => [p.id, p.id === ground ? -1 : count++]));
  const node = (pin: string) => {
    const n = nodes.get(pin);
    if (n === undefined) throw new Error(`${type}: unknown pin ${pin}`);
    return n;
  };
  const props = { ...def.defaults };
  const model = def.sim!({ props, net: node, node: () => count++, input: () => undefined });
  const elements = [
    ...model.elements,
    ...Object.keys(inputs).map((pin) => new VSource(node(pin), -1, () => inputs[pin], () => 0.01)),
    ...Object.entries(loads).map(([pin, r]) => new Resistor(node(pin), -1, () => r)),
  ];
  const circuit = new Circuit(count, elements);
  const settle = (patch: Record<string, number> = {}) => {
    Object.assign(inputs, patch);
    for (let i = 0; i < 12; i++) {
      expect(circuit.solve(1e-6).converged).toBe(true);
      model.tracker?.sample(circuit.v, 1e-6);
      model.changed?.();
    }
    circuit.solve(1e-6);
  };
  settle();
  return { settle, volts: (pin: string) => node(pin) < 0 ? 0 : circuit.v[node(pin)], props, model, circuit };
}

describe('component catalog', () => {
  it('has unique types and valid, bounded pins for every package and symbol', () => {
    expect(new Set(PART_LIST.map((p) => p.type)).size).toBe(PART_LIST.length);
    for (const def of Object.values(PARTS)) {
      const pins = def.pins(def.defaults);
      const bounds = def.bounds(def.defaults);
      expect(new Set(pins.map((p) => p.id)).size, def.type).toBe(pins.length);
      for (const pin of pins) {
        expect(Number.isFinite(pin.x) && Number.isFinite(pin.y), `${def.type}:${pin.id}`).toBe(true);
        expect(pin.x, def.type).toBeGreaterThanOrEqual(bounds.x);
        expect(pin.x, def.type).toBeLessThanOrEqual(bounds.x + bounds.w);
        expect(pin.y, def.type).toBeGreaterThanOrEqual(bounds.y);
        expect(pin.y, def.type).toBeLessThanOrEqual(bounds.y + bounds.h);
      }
      for (const g of def.ground ?? []) expect(pins.some((p) => p.id === g), `${def.type}:${g}`).toBe(true);
    }
    expect(CHIPS.length).toBeGreaterThanOrEqual(40);
  });

  it.each(CHIPS.map((p) => [p.type]))('%s has numbered pins and meaningful tooltips', (type) => {
    const pins = PARTS[type].pins({});
    expect(pins.length % 2).toBe(0);
    pins.forEach((pin) => {
      expect(pin.label).toContain('patilla');
      expect(pin.desc, `${type}:${pin.id}`).toBeTruthy();
    });
  });

  it('keeps all logic-chip pins available in an unconnected schematic', () => {
    for (const chip of CHIPS) {
      const symbol = PARTS[`sch:${chip.type}`];
      expect(symbol.pins({ __pins: '' }).length, chip.type).toBe(chip.pins({}).length);
    }
  });
});

describe('logic models under electrical load', () => {
  it.each([4, 6, 8])('DIP ×%i switches each contact independently under load', (count) => {
    const inputs = Object.fromEntries(Array.from({ length: count }, (_, i) => [`${i + 1}A`, 5]));
    const loads = Object.fromEntries(Array.from({ length: count }, (_, i) => [`${i + 1}B`, 1000]));
    const h = fixture(`dip-switch-${count}`, inputs, loads);
    for (let selected = 1; selected <= count; selected++) {
      for (let i = 1; i <= count; i++) h.props[`s${i}`] = i === selected;
      h.settle();
      for (let i = 1; i <= count; i++) {
        if (i === selected) expect(h.volts(`${i}B`)).toBeGreaterThan(4.9);
        else expect(h.volts(`${i}B`)).toBeLessThan(.01);
      }
    }
    for (let i = 1; i <= count; i++) h.props[`s${i}`] = true;
    h.settle();
    for (let i = 1; i <= count; i++) expect(h.volts(`${i}B`)).toBeGreaterThan(4.9);
    for (let i = 1; i <= count; i++) h.props[`s${i}`] = false;
    h.settle();
    for (let i = 1; i <= count; i++) expect(h.volts(`${i}B`)).toBeLessThan(.01);
  });

  it.each([
    ['74hc00', [true, true, true, false]],
    ['74hc02', [true, false, false, false]],
    ['74hc08', [false, false, false, true]],
    ['74hc32', [false, true, true, true]],
    ['74hc86', [false, true, true, false]],
    ['cd4011', [true, true, true, false]],
    ['cd4001', [true, false, false, false]],
    ['cd4077', [true, false, false, true]],
  ] as const)('%s matches its truth table', (type, table) => {
    const cmos = type.startsWith('cd');
    const h = fixture(type, { [cmos ? 'VDD' : 'VCC']: 5, '1A': 0, '1B': 0 }, { '1Y': 1000 });
    table.forEach((high, i) => {
      h.settle({ '1A': (i & 2) ? 5 : 0, '1B': (i & 1) ? 5 : 0 });
      if (high) expect(h.volts('1Y')).toBeGreaterThan(4.5);
      else expect(h.volts('1Y')).toBeLessThan(0.1);
    });
  });

  it('74HC74 captures only rising edges and honors asynchronous clear and preset', () => {
    // TI SN74HC74, function table: https://www.ti.com/lit/ds/symlink/sn74hc74.pdf
    const h = fixture('74hc74', { VCC: 5, '1CLR': 5, '1PRE': 5, '1D': 0, '1CLK': 0 });
    h.settle({ '1D': 5 });
    expect(h.volts('1Q')).toBeLessThan(0.1);
    h.settle({ '1CLK': 5 });
    expect(h.volts('1Q')).toBeGreaterThan(4.5);
    h.settle({ '1D': 0 });
    expect(h.volts('1Q')).toBeGreaterThan(4.5);
    h.settle({ '1CLR': 0 });
    expect(h.volts('1Q')).toBeLessThan(0.1);
    h.settle({ '1CLR': 5, '1PRE': 0 });
    expect(h.volts('1Q')).toBeGreaterThan(4.5);
    h.settle({ '1CLR': 0 });
    expect(h.volts('1Q')).toBeGreaterThan(4.5);
    expect(h.volts('1QN')).toBeGreaterThan(4.5);
  });

  it('74HC595 shifts serial data, holds the latch and disables its outputs', () => {
    // TI SN74HC595: independent shift/storage clocks and active-low OE.
    const h = fixture('74hc595', { VCC: 5, MR: 5, OE: 0, SHCP: 0, STCP: 0, DS: 0 }, { Q0: 1000, Q7: 1000 });
    for (const bit of [1, 0, 1, 0, 0, 1, 0, 1]) {
      h.settle({ DS: bit * 5, SHCP: 0 });
      h.settle({ SHCP: 5 });
    }
    expect(h.volts('Q0')).toBeLessThan(0.1);
    h.settle({ STCP: 5 });
    expect(h.volts('Q0')).toBeGreaterThan(4.5);
    expect(h.volts('Q7')).toBeGreaterThan(4.5);
    h.settle({ MR: 0 });
    expect(h.volts('Q0')).toBeGreaterThan(4.5);
    h.settle({ OE: 5 });
    expect(h.volts('Q0')).toBeLessThan(0.01);
    h.settle({ OE: 0, STCP: 0 });
    h.settle({ STCP: 5 });
    expect(h.volts('Q0')).toBeLessThan(0.1);
  });

  it('74HC161 and 163 distinguish asynchronous and synchronous clear', () => {
    for (const type of ['74hc161', '74hc163']) {
      const h = fixture(type, { VCC: 5, MR: 5, PE: 5, CEP: 5, CET: 5, CP: 0 });
      h.settle({ CP: 5 });
      expect(h.volts('Q0')).toBeGreaterThan(4.5);
      h.settle({ MR: 0 });
      expect(h.volts('Q0') > 4.5).toBe(type === '74hc163');
      h.settle({ CP: 0 });
      h.settle({ CP: 5 });
      expect(h.volts('Q0')).toBeLessThan(0.1);
    }
  });

  it('releases logic outputs when supply power is removed', () => {
    const h = fixture('74hc00', { VCC: 5, '1A': 0, '1B': 0 }, { '1Y': 1000 });
    expect(h.volts('1Y')).toBeGreaterThan(4.5);
    h.settle({ VCC: 0 });
    expect(h.volts('1Y')).toBeLessThan(0.01);
  });

  it('CD4066 disconnects the analog path when unpowered', () => {
    const h = fixture('cd4066', { VDD: 5, '1E': 5, '1Y': 3 }, { '1Z': 1000 });
    expect(h.volts('1Z')).toBeGreaterThan(2.5);
    h.settle({ VDD: 0 });
    expect(h.volts('1Z')).toBeLessThan(0.01);
  });
});

describe('bench supply', () => {
  it('delivers regulated voltage, limits current, and recovers after overload', () => {
    const h = fixture('bench-supply', {}, { '+': 100 });
    h.props.voltage = 10;
    h.props.current = 0.05;
    h.settle();
    expect(h.volts('+')).toBeCloseTo(5, 2);
    expect(h.model.tracker!.read().cc).toBe(true);
    h.props.current = 0.2;
    h.settle();
    expect(h.volts('+')).toBeCloseTo(10, 2);
    expect(h.model.tracker!.read().cc).toBe(false);
    h.props.current = 0;
    h.settle();
    expect(h.volts('+')).toBeCloseTo(0, 3);
    h.props.current = 0.2;
    h.props.voltage = 0;
    h.settle();
    expect(h.volts('+')).toBeCloseTo(0, 3);
  });
});

describe('LED insertion', () => {
  it('rebuilds live breadboard connectivity when the LED is flipped', () => {
    const part = (id: string, type: string, x: number, y: number, props: Props = {}): PartData => ({ id, type, x, y, rot: 0, props });
    const board = part('bb', 'breadboard-half', 0, 0);
    const pins = PARTS[board.type].pins({ ...PARTS[board.type].defaults });
    const socket = pins.find((p) => p.id === 'a1')!;
    expect(socket).toBeTruthy();
    const engine = new SimEngine();
    const led = part('led', 'led', socket.x, socket.y, { color: 'red' });
    const supply = part('supply', 'bench-supply', 1000, 0, { voltage: 5, current: 1 });
    const resistor = part('r', 'resistor', 2000, 0, { resistance: 220 });
    const links = [['supply', '+', 'r', '1'], ['r', '2', 'bb', 'b2'], ['supply', '-', 'bb', 'b1']];
    const wires = links.map(([a, ap, b, bp], i) => ({ id: `w${i}`, a: { part: a, pin: ap, x: 0, y: 0 }, b: { part: b, pin: bp, x: 0, y: 0 }, color: '#000', points: [] }));
    engine.update({ parts: [board, led, supply, resistor], wires });
    engine.start({ manual: true });
    engine.tick(0.01);
    expect(Number(engine.getVisual('led')?.i)).toBeGreaterThan(0.01);
    engine.update({ parts: [board, { ...led, props: { ...led.props, flip: true } }, supply, resistor], wires });
    engine.tick(0.01);
    expect(Math.abs(Number(engine.getVisual('led')?.i))).toBeLessThan(1e-6);
    engine.stop();
  });
});
