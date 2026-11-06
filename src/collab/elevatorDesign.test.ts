import { describe, expect, it } from 'vitest';
import { elevatorDesign } from './elevatorDesign';
import { findTemplate, templateSnapshot } from './applyTemplate';
import { LogicSim } from '../logic/sim';
import { elementDef } from '../logic/elements';
import { buildNetlist, pinKey } from '../core/netlist';
import { PARTS } from '../parts';
import { routeDesign } from '../logic/routeDesign';

const snapshot = () => templateSnapshot(findTemplate('elevator-class')!);
function setup() {
  const result = elevatorDesign(snapshot()), main = result.sheets[0];
  const sim = new LogicSim(main, id => result.sheets.find(s => s.id === id));
  const run = () => { sim.advance(0.3); expect(sim.problem).toBeNull(); };
  const sensor = (floor: number) => {
    for (let n = 1; n <= 4; n++) sim.setSource(`SP${n}`, 1, false);
    sim.settle(); run(); if (floor) sim.setSource(`SP${floor}`, 0); run();
  };
  const press = (floor: number) => { sim.setSource(`PP${floor}`, 0); run(); sim.setSource(`PP${floor}`, 1); run(); };
  const indicator = (name: string) => sim.value(`indicator-${name}`, 'A');
  const digit = (ref: string) => [...'abcdefg'].map(pin => sim.value(`display-${ref}`, pin)).join('');
  run(); return { ...result, main, sim, run, sensor, press, indicator, digit };
}

describe('design derived from the physical elevator', () => {
  it('contains each physical logic IC exactly once, inside inspectable functional stages', () => {
    const source = snapshot(), { sheets } = elevatorDesign(source);
    const chips = sheets.flatMap(s => s.nodes.filter(n => n.kind.startsWith('chip:')));
    const expected = source.parts.filter(p => PARTS[p.type]?.chip && p.type !== 'ne555');
    expect(chips.map(n => n.props.sourcePart).sort()).toEqual(expected.map(p => p.id).sort());
    expect(new Set(chips.map(n => n.props.sourcePart)).size).toBe(chips.length);
    expect(sheets[0].nodes.filter(n => n.kind === 'seg7')).toHaveLength(2);
    expect(sheets).toHaveLength(6);
  });
  it('preserves every logical physical net when the hierarchy is flattened', () => {
    const source = snapshot(), { sheets } = elevatorDesign(source), lookup = (id: string) => sheets.find(s => s.id === id);
    const physical = buildNetlist(source, PARTS), parent = new Map<string, string>();
    const find = (x: string): string => { const p = parent.get(x); if (!p || p === x) { parent.set(x, x); return x; } const r = find(p); parent.set(x, r); return r; };
    const union = (a: string, b: string) => parent.set(find(a), find(b));
    const key = (sheet: string, node: string, pin: string) => `${sheet}|${node}|${pin}`;
    for (const sheet of sheets) {
      for (const w of sheet.wires) union(key(sheet.id, w.a.node, w.a.pin), key(sheet.id, w.b.node, w.b.pin));
      for (const node of sheet.nodes) {
        if (node.kind.startsWith('ic:')) {
          const inner = lookup(node.kind.slice(3))!;
          for (const port of inner.nodes.filter(n => n.kind === 'in' || n.kind === 'out')) union(key(sheet.id, node.id, port.id), key(inner.id, port.id, port.kind === 'in' ? 'Y' : 'A'));
        }
        if (node.kind === 'const') union(key(sheet.id, node.id, 'Y'), `constant-${node.props.value}`);
      }
    }
    const physicalToLogical = new Map<number, Set<string>>(), logicalToPhysical = new Map<string, Set<number>>();
    for (const sheet of sheets) for (const node of sheet.nodes.filter(n => n.kind.startsWith('chip:'))) {
      const def = elementDef(node.kind, lookup)!;
      for (const pin of def.pins(node.props, { sheet: lookup, instantiate: () => null })) {
        const net = physical.netOf.get(pinKey(String(node.props.sourcePart), pin.id))!;
        const logical = find(key(sheet.id, node.id, pin.id));
        physicalToLogical.set(net, new Set([...(physicalToLogical.get(net) ?? []), logical]));
        logicalToPhysical.set(logical, new Set([...(logicalToPhysical.get(logical) ?? []), net]));
      }
    }
    expect([...physicalToLogical.values()].every(v => v.size === 1)).toBe(true);
    expect([...logicalToPhysical.values()].every(v => v.size === 1)).toBe(true);
  });
  it('matches direction for all twelve distinct floor pairs and releases busy at arrival', () => {
    for (let current = 1; current <= 4; current++) for (let destination = 1; destination <= 4; destination++) {
      if (current === destination) continue;
      const h = setup(); h.sensor(current); h.press(destination);
      expect(h.indicator('OCUPADO')).toBe(1);
      expect(h.indicator('SUBIR')).toBe(destination > current ? 1 : 0);
      expect(h.indicator('BAJAR')).toBe(destination < current ? 1 : 0);
      h.sensor(destination); expect(h.indicator('PARAR')).toBe(1); expect(h.indicator('OCUPADO')).toBe(0);
    }
  });
  it('shows both real displays, holds the floor between sensors, blocks new calls, and resets', () => {
    const h = setup(); h.sensor(1); expect(h.digit('U19')).toBe('0110000');
    h.press(4); expect(h.digit('U14')).toBe('0110011');
    h.press(2); expect(h.digit('U14')).toBe('0110011');
    h.sensor(0); expect(h.digit('U19')).toBe('0110000');
    h.sensor(3); expect(h.digit('U19')).toBe('1111001');
    h.sim.setSource('RESET', 0); h.run(); expect(h.indicator('OCUPADO')).toBe(0); expect(h.digit('U14')).toBe('0000000');
  });
  it('routes every connection orthogonally around node bodies without changing connectivity', () => {
    const { sheets } = elevatorDesign(snapshot()), lookup = (id: string) => sheets.find(s => s.id === id);
    for (const sheet of sheets) {
      const before = sheet.wires.map(w => [w.a, w.b]); routeDesign(sheet, lookup);
      expect(sheet.wires.map(w => [w.a, w.b])).toEqual(before);
      for (const wire of sheet.wires) {
        expect(wire.points).toBeDefined(); expect(wire.color).toMatch(/^#[a-f\d]{6}$/i);
        const points = wire.points!;
        for (let i = 1; i < points.length; i++) expect(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y).toBe(true);
        const end = (ref: typeof wire.a) => {
          const n = sheet.nodes.find(n => n.id === ref.node)!, def = elementDef(n.kind, lookup)!;
          const pin = def.pins(n.props, { sheet: lookup, instantiate: () => null }).find(p => p.id === ref.pin)!;
          return { x: n.x + pin.x, y: n.y + pin.y };
        };
        const route = [end(wire.a), ...points, end(wire.b)];
        for (const node of sheet.nodes) {
          const { w, h } = elementDef(node.kind, lookup)!.size(node.props, { sheet: lookup, instantiate: () => null });
          for (let i = 1; i < route.length; i++) {
            const a = route[i - 1], b = route[i];
            const crosses = a.x === b.x
              ? a.x > node.x && a.x < node.x + w && Math.max(a.y, b.y) > node.y && Math.min(a.y, b.y) < node.y + h
              : a.y > node.y && a.y < node.y + h && Math.max(a.x, b.x) > node.x && Math.min(a.x, b.x) < node.x + w;
            expect(crosses, `${sheet.name}: ${wire.label} atraviesa ${node.id}`).toBe(false);
          }
        }
      }
    }
  });
});
