import { describe, expect, it } from 'vitest';
import { buildNetlist, pinKey } from '../core/netlist';
import type { CircuitSnapshot, PartData } from '../core/types';
import { PARTS } from '../parts';
import { buildSchematic } from './schematic';
import { scorePart } from '../parts/search';

const part = (id: string, type: string, x = 0): PartData => ({ id, type, x, y: 0, rot: 0, props: { ...PARTS[type].defaults } });
const snapshot = (parts: PartData[], links: [string, string, string, string][]): CircuitSnapshot => ({ parts, wires: links.map(([a, ap, b, bp], i) => ({ id: `w${i}`, a: { part: a, pin: ap, x: 0, y: 0 }, b: { part: b, pin: bp, x: 0, y: 0 }, color: '#000', points: [], sch: true })) });

describe('schematic connectivity', () => {
  it('shows both inputs when they are tied to the same net', () => {
    const s = snapshot([part('chip', '74hc08'), part('source', 'bench-supply', 1000)], [['source', '+', 'chip', '1A'], ['source', '+', 'chip', '1B']]);
    const n = buildNetlist(s, PARTS);
    const schematic = buildSchematic(s, n);
    const net = schematic.nets.find((net) => net.id === n.netOf.get(pinKey('chip', '1A')))!;
    expect(net.pins).toHaveLength(3);
  });

  it('draws a feedback connection between pins of the same chip', () => {
    const s = snapshot([part('chip', '74hc74')], [['chip', '1QN', 'chip', '1D']]);
    const sch = buildSchematic(s, buildNetlist(s, PARTS));
    expect(sch.nets).toHaveLength(1);
    expect(sch.nets[0].segments.length).toBeGreaterThan(0);
  });

  it('collapses aliases already connected inside an Arduino', () => {
    const s = snapshot([part('uno', 'arduino-uno'), part('r', 'resistor', 1000)], [['uno', 'GND.1', 'r', '1']]);
    const sch = buildSchematic(s, buildNetlist(s, PARTS));
    const ground = sch.nets.find((n) => n.kind === 'ground')!;
    expect(ground.pins).toHaveLength(2);
  });
});

describe('component search', () => {
  it('ranks exact references over incidental numbers and accepts reference spacing', () => {
    expect(scorePart(PARTS['74hc595'], '74 hc 595')).toBe(100);
    expect(scorePart(PARTS['74hc595'], '595')).toBe(100);
    expect(scorePart(PARTS['74hc595'], '74hc595')).toBeGreaterThan(scorePart(PARTS['74hc165'], '74hc595'));
  });
  it.each(['74ls595', 'SN74HC595', 'registro desplazamiento', 'shift register'])('finds the 595 by %s', (q) => {
    expect(scorePart(PARTS['74hc595'], q)).toBeGreaterThan(0);
  });
  it('accepts an abbreviated component name without matching arbitrary distant letters', () => {
    expect(scorePart(PARTS.servo, 'srvo')).toBeGreaterThan(0);
    expect(scorePart(PARTS.servo, 'zzq')).toBe(0);
  });
});
