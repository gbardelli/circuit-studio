import { describe, expect, it } from 'vitest';
import { elevatorTemplate } from './elevator';
import { templateSnapshot } from './applyTemplate';
import { buildNetlist } from '../core/netlist';
import { PARTS } from '../parts';
import { roundedPath } from '../ui/wires';
import { sharedTrackLength } from '../core/wireRouting';
import { toWorld } from '../core/types';
import contract from './fixtures/elevator-networks.json';
import { componentBodies } from './physicalWiring';
import { ELEVATOR_SIGNAL_COLORS } from './elevatorPalette';

describe('physical elevator wiring', () => {
  const scene = templateSnapshot(elevatorTemplate());
  const nets = buildNetlist(scene, PARTS);
  const bridges = scene.parts.filter(p=>p.type==='level-converter-4').flatMap(p=>[1,2,3,4].map(i=>({ id:`${p.id}-bridge${i}`, a:{part:p.id,pin:`L${i}`,x:0,y:0}, b:{part:p.id,pin:`H${i}`,x:0,y:0}, points:[],color:'#000000' })));
  const logical = buildNetlist({...scene,wires:[...scene.wires,...bridges]},PARTS);
  it('preserves the original electrical partition of every device pin after relocating and rewiring', () => {
    // Only the total-time display interface intentionally changes: four BCD GPIOs and blanking.
    const changed = new Set(['u17:A', 'u17:B', 'u17:C', 'u17:D', 'u17:BIRBO', 'giga:D6', 'giga:D7', 'giga:D8', 'giga:D9','giga:3V3','u11:MR','ls:A','ls:K','lb:A','lb:K','lsR:1','lsR:2','lbR:1','lbR:2','u3:2A','u3:2Y','u3:4A','u3:4Y','u2:1A','u2:1B','u2:1Y']);
    const oldKeys = new Set(contract.flat());
    const present = new Set(scene.parts.flatMap(p=>PARTS[p.type].pins(p.props).map(pin=>`${p.id}:${pin.id}`)));
    const normalized = (key:string) => key.replace(/^u12:([AB])([0-3])$/,(_,bank,bit)=>`u12:${bank==='A'?'B':'A'}${bit}`).replace(/^u12:OAGTB$/,'u12:SWAP').replace(/^u12:OALTB$/,'u12:OAGTB').replace(/^u12:SWAP$/,'u12:OALTB');
    const groups = new Map<number, string[]>();
    for (const p of scene.parts.filter(p => !p.type.startsWith('breadboard'))) for (const pin of PARTS[p.type].pins(p.props)) {
      const original = `${p.id}:${pin.id}`, k = normalized(original), n = logical.netOf.get(original)!;
      // U16 (de 74HC193 a secuenciador 74LS173) y U18 (su lógica de recarga) se rehicieron a propósito.
      if (changed.has(k) || /^u1[68]:/.test(k) || !oldKeys.has(k)) continue;
      if (!groups.has(n)) groups.set(n, []); groups.get(n)!.push(k);
    }
    expect([...groups.values()].map(g => g.sort()).sort((a, b) => a[0].localeCompare(b[0]))).toEqual(contract.map(g => g.filter(k => !changed.has(k) && !/^u1[68]:/.test(k) && present.has(k))).filter(g => g.length).sort((a, b) => a[0].localeCompare(b[0])));
    ['A', 'B', 'C', 'D'].forEach((pin, bit) => expect(logical.netOf.get(`u17:${pin}`)).toBe(logical.netOf.get(`giga:D${6 + bit}`)));
    expect(nets.netOf.get('u17:BIRBO')).toBe(nets.netOf.get('u5:2Q'));
  });
  it('uses distinct free sockets and keeps every mounted leg inserted', () => {
    const occupied = new Set(nets.inserted.values()), terminals = new Set<string>();
    for (const w of scene.wires) for (const end of [w.a, w.b]) {
      const key = `${end.part}:${end.pin}`;
      expect(terminals.has(key), key).toBe(false); terminals.add(key);
      if (end.part?.startsWith('b')) expect(occupied.has(key), key).toBe(false);
    }
    for (const p of scene.parts.filter(p => !p.type.startsWith('breadboard') && !PARTS[p.type].mcu)) for (const pin of PARTS[p.type].pins(p.props).filter(pin=>pin.kind==='leg')) expect(nets.inserted.has(`${p.id}:${pin.id}`)).toBe(true);
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
    // Uniform gaps and four total-time BCD leads take priority over the tightest packing.
    expect(length).toBeLessThan(83_040 * .90);
    expect(scene.wires.length).toBeLessThan(320);
    const displays = scene.parts.filter(p => p.type === 'seven-segment');
    expect(new Set(displays.map(p => toWorld(p, { x: 0, y: 0 }).y)).size).toBe(1);
  });
  it('spaces every neighboring IC body on boards 2 and 3 by the same 30 units', () => {
    for (const [low, high, count] of [[360, 720, 6], [720, 1080, 5]]) {
      const chips = scene.parts.filter(p => /^(74|ne555)/.test(p.type) && p.y >= low && p.y < high).sort((a, b) => a.x - b.x);
      expect(chips).toHaveLength(count);
      const bodies = chips.map(p => componentBodies([p])[0]);
      for (let n = 1; n < bodies.length; n++) expect(bodies[n].x - bodies[n-1].x - bodies[n-1].w).toBe(30);
    }
  });
  it('uses one consistent color per named signal and distinguishes neighboring bus bits', () => {
    for (const [part, pin, name] of [['u8', 'Q0', 'DEST0'], ['u8', 'Q1', 'DEST1'], ['u8', 'Q2', 'DEST2'], ['u5', '1Q', 'OCUPADO'], ['u6', '4Y', 'ACEPTAR'], ['sp', '1B', 'SP1']]) {
      const net = nets.netOf.get(`${part}:${pin}`);
      const wires = scene.wires.filter(w => nets.netOf.get(`${w.a.part}:${w.a.pin}`) === net);
      expect(wires.length).toBeGreaterThan(0);
      expect(new Set(wires.map(w => w.color))).toEqual(new Set([ELEVATOR_SIGNAL_COLORS[name]]));
    }
    expect(new Set(['DEST0', 'DEST1', 'DEST2', 'OCUPADO', 'ACEPTAR'].map(n => ELEVATOR_SIGNAL_COLORS[n])).size).toBe(5);
  });
});
