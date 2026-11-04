import { describe, expect, it } from 'vitest';
import { elevatorTemplate } from './elevator';
import { templateSnapshot } from './applyTemplate';
import { buildNetlist } from '../core/netlist';
import { PARTS } from '../parts';
import { roundedPath } from '../ui/wires';
import { sharedTrackLength } from '../core/wireRouting';
import { toWorld } from '../core/types';
import contract from './fixtures/elevator-networks.json';

describe('physical elevator wiring', () => {
  const scene = templateSnapshot(elevatorTemplate());
  const nets = buildNetlist(scene, PARTS);
  it('preserves the original electrical partition of every device pin after relocating and rewiring', () => {
    const groups = new Map<number, string[]>();
    for (const p of scene.parts.filter(p => !p.type.startsWith('breadboard'))) for (const pin of PARTS[p.type].pins(p.props)) {
      const k = `${p.id}:${pin.id}`, n = nets.netOf.get(k)!;
      if (!groups.has(n)) groups.set(n, []); groups.get(n)!.push(k);
    }
    expect([...groups.values()].map(g => g.sort()).sort((a, b) => a[0].localeCompare(b[0]))).toEqual(contract);
  });
  it('uses distinct free sockets and keeps every mounted leg inserted', () => {
    const occupied = new Set(nets.inserted.values()), terminals = new Set<string>();
    for (const w of scene.wires) for (const end of [w.a, w.b]) {
      const key = `${end.part}:${end.pin}`;
      expect(terminals.has(key), key).toBe(false); terminals.add(key);
      if (end.part?.startsWith('b')) expect(occupied.has(key), key).toBe(false);
    }
    for (const p of scene.parts.filter(p => !p.type.startsWith('breadboard') && !PARTS[p.type].mcu)) for (const pin of PARTS[p.type].pins(p.props)) expect(nets.inserted.has(`${p.id}:${pin.id}`)).toBe(true);
  });
  it('keeps every rounded cable and its stroke clear of the three display faces', () => {
    const displays = scene.parts.filter(p => p.type === 'seven-segment').map(p => ({ x: p.x - 8, y: p.y - 6, w: 56, h: 72 }));
    for (const w of scene.wires) {
      const tokens = roundedPath([w.a, ...w.points, w.b]).match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!;
      let x = 0, y = 0;
      for (let n = 0; n < tokens.length;) {
        const command = tokens[n++], a = Number(tokens[n++]), b = Number(tokens[n++]);
        if (command === 'M') { x = a; y = b; continue; }
        const end = command === 'Q' ? { x: Number(tokens[n++]), y: Number(tokens[n++]) } : { x: a, y: b };
        for (let k = 0; k <= 40; k++) {
          const t = k / 40, u = 1 - t;
          const p = command === 'Q' ? { x: u*u*x + 2*u*t*a + t*t*end.x, y: u*u*y + 2*u*t*b + t*t*end.y } : { x: x + t*(end.x-x), y: y + t*(end.y-y) };
          expect(displays.some(r => p.x > r.x - 1.65 && p.x < r.x + r.w + 1.65 && p.y > r.y - 1.65 && p.y < r.y + r.h + 1.65), w.id).toBe(false);
        }
        x = end.x; y = end.y;
      }
    }
  });
  it('shortens the original 83,040-unit layout without shared tracks or diagonal jumpers', () => {
    const routes = scene.wires.map(w => [w.a, ...w.points, w.b]);
    expect(sharedTrackLength(routes)).toBe(0);
    let length = 0;
    for (const ps of routes) for (let n = 1; n < ps.length; n++) {
      expect(ps[n].x === ps[n-1].x || ps[n].y === ps[n-1].y).toBe(true);
      length += Math.abs(ps[n].x - ps[n-1].x) + Math.abs(ps[n].y - ps[n-1].y);
    }
    expect(length).toBeLessThan(83_040 * .65);
    expect(scene.wires.length).toBeLessThan(263);
    const displays = scene.parts.filter(p => p.type === 'seven-segment');
    expect(new Set(displays.map(p => toWorld(p, { x: 0, y: 0 }).y)).size).toBe(1);
  });
});
