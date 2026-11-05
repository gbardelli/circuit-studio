import { buildNetlist, pinKey } from '../core/netlist';
import { toWorld, type CircuitSnapshot, type PartData, type Vec, type WireData, type WireEnd } from '../core/types';
import { PARTS } from '../parts';
import type { RouteObstacle } from '../core/wireRouting';

export function componentBodies(parts: readonly PartData[]): RouteObstacle[] {
  const bodies = parts.filter(p => !p.type.startsWith('breadboard')).map(p => {
    let b = PARTS[p.type].bounds(p.props);
    if (/^(74|cd4|ne555|tlc555)/.test(p.type)) b = { x: b.x + 1, y: 3, w: b.w - 2, h: 24 };
    else if (p.type === 'resistor') b = { x: 9, y: -6, w: 22, h: 12 };
    else if (p.type === 'pushbutton') b = { x: 0, y: 4, w: 20, h: 22 };
    else if (p.type === 'led' || p.type === 'capacitor') b = { ...b, h: b.h - 10 };
    const corners = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }].map(at => toWorld(p, at));
    const x = Math.min(...corners.map(c => c.x)), y = Math.min(...corners.map(c => c.y));
    const margin = p.type === 'seven-segment' ? 4 : 0;
    return { x: x - margin, y: y - margin, w: Math.max(...corners.map(c => c.x)) - x + 2 * margin, h: Math.max(...corners.map(c => c.y)) - y + 2 * margin };
  });
  const labels = parts.filter(p=>p.type.startsWith('breadboard')).flatMap(p=>['topVoltage','bottomVoltage'].flatMap((key,i)=>p.props[key]!==undefined?[{x:p.x+Number(p.props.cols??63)*10+55,y:p.y+(i?200:20)-12,w:52,h:21}]:[]));
  const interfaceLabels=parts.filter(p=>p.type==='level-converter-4').map(p=>({x:p.x-30,y:p.y-26,w:110,h:15}));
  return [...bodies,...labels,...interfaceLabels];
}
const distance = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inside = (p: Vec, r: RouteObstacle, margin = 0) => p.x > r.x - margin && p.x < r.x + r.w + margin && p.y > r.y - margin && p.y < r.y + r.h + margin;

export function colorNamedNetworks(scene: CircuitSnapshot, palette: Readonly<Record<string, string>>): CircuitSnapshot {
  const nets = buildNetlist(scene, PARTS), colors = new Map<number, string>();
  for (const p of scene.parts) for (const item of String(p.props.nets ?? '').split(';')) {
    const split = item.indexOf('=');
    if (split < 0) continue;
    const name = item.slice(split + 1), net = nets.netOf.get(pinKey(p.id, item.slice(0, split)));
    if (net !== undefined && palette[name] && !colors.has(net)) colors.set(net, palette[name]);
  }
  return { ...scene, wires: scene.wires.map(w => ({ ...w, color: colors.get(nets.netOf.get(pinKey(w.a.part!, w.a.pin!))!) ?? w.color })) };
}

/** Reuse breadboard strips as junctions. Each jumper still occupies two distinct, free holes. */
export function shortenPhysicalWiring(scene: CircuitSnapshot): CircuitSnapshot {
  const base = buildNetlist({ ...scene, wires: [] }, PARTS), full = buildNetlist(scene, PARTS);
  const bodies = componentBodies(scene.parts);
  const occupied = new Set(base.inserted.values());
  const usedGroups = new Set(scene.wires.flatMap(w => [base.netOf.get(pinKey(w.a.part!, w.a.pin!))!, base.netOf.get(pinKey(w.b.part!, w.b.pin!))!]));
  const ports = new Map<number, WireEnd[]>();
  for (const p of scene.parts) for (const pin of PARTS[p.type].pins(p.props)) {
    const key = pinKey(p.id, pin.id), group = base.netOf.get(key)!;
    if (!usedGroups.has(group) || occupied.has(key)) continue;
    if (!p.type.startsWith('breadboard') && !PARTS[p.type].mcu && !['level-converter-4','bench-supply'].includes(p.type)) continue;
    const pos = toWorld(p, pin);
    if (p.type.startsWith('breadboard') && bodies.some(b => inside(pos, b, 2))) continue;
    if (!ports.has(group)) ports.set(group, []);
    ports.get(group)!.push({ part: p.id, pin: pin.id, ...pos });
  }
  const nets = new Map<number, WireData[]>();
  for (const wire of scene.wires) {
    const net = full.netOf.get(pinKey(wire.a.part!, wire.a.pin!))!;
    if (!nets.has(net)) nets.set(net, []);
    nets.get(net)!.push(wire);
  }
  const wires: WireData[] = [];
  for (const original of nets.values()) {
    const groups = [...new Set(original.flatMap(w => [base.netOf.get(pinKey(w.a.part!, w.a.pin!))!, base.netOf.get(pinKey(w.b.part!, w.b.pin!))!]))];
    if (groups.length < 2) continue;
    const parent = new Map(groups.map(n => [n, n]));
    const root = (n: number): number => parent.get(n) === n ? n : root(parent.get(n)!);
    const colors = new Map<string, number>();
    for (const w of original) colors.set(w.color, (colors.get(w.color) ?? 0) + 1);
    const color = [...colors].sort((a, b) => b[1] - a[1])[0][0];
    const candidates: { a: WireEnd; b: WireEnd; ga: number; gb: number; cost: number }[] = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = ports.get(groups[i]) ?? [], b = ports.get(groups[j]) ?? [];
      const options = a.flatMap(pa => b.map(pb => ({ a: pa, b: pb, ga: groups[i], gb: groups[j], cost: distance(pa, pb) })));
      options.sort((a, b) => a.cost - b.cost);
      candidates.push(...options.slice(0, 24));
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const used = new Set<string>(), tree: WireData[] = [];
    for (const edge of candidates) {
      if (root(edge.ga) === root(edge.gb) || used.has(pinKey(edge.a.part!, edge.a.pin!)) || used.has(pinKey(edge.b.part!, edge.b.pin!))) continue;
      parent.set(root(edge.ga), root(edge.gb));
      used.add(pinKey(edge.a.part!, edge.a.pin!)); used.add(pinKey(edge.b.part!, edge.b.pin!));
      tree.push({ id: '', a: edge.a, b: edge.b, color, points: [] });
      if (tree.length === groups.length - 1) break;
    }
    wires.push(...(tree.length === groups.length - 1 ? tree : original));
  }
  return { ...scene, wires: wires.map((w, i) => ({ ...w, id: `w${i}` })) };
}

class Queue {
  private items: { key: number; cost: number }[] = [];
  push(item: { key: number; cost: number }) {
    const q = this.items; q.push(item); let n = q.length - 1;
    while (n > 0) { const p = (n - 1) >> 1; if (q[p].cost <= item.cost) break; q[n] = q[p]; n = p; } q[n] = item;
  }
  pop() {
    const q = this.items, first = q[0], last = q.pop()!;
    if (q.length) { let n = 0; while (n * 2 + 1 < q.length) { let c = n * 2 + 1; if (c + 1 < q.length && q[c + 1].cost < q[c].cost) c++; if (q[c].cost >= last.cost) break; q[n] = q[c]; n = c; } q[n] = last; }
    return first;
  }
  get length() { return this.items.length; }
}

/** Orthogonal, obstacle-aware paths. Occupied tracks are reserved, crossings remain perpendicular. */
export function routePhysicalWiring(scene: CircuitSnapshot): CircuitSnapshot {
  const bodies = componentBodies(scene.parts);
  const boards = scene.parts.filter(p => p.type.startsWith('breadboard'));
  const all = scene.wires.flatMap(w => [w.a, w.b]);
  const step = 5, x0 = Math.floor((Math.min(...all.map(p => p.x)) - 80) / step) * step;
  const y0 = Math.floor((Math.min(...all.map(p => p.y)) - 80) / step) * step;
  const width = Math.ceil((Math.max(...all.map(p => p.x)) + 100 - x0) / step) + 1;
  const height = Math.ceil((Math.max(...all.map(p => p.y)) + 100 - y0) / step) + 1;
  const count = width * height;
  const at = (p: Vec) => Math.round((p.y - y0) / step) * width + Math.round((p.x - x0) / step);
  const point = (cell: number): Vec => ({ x: x0 + cell % width * step, y: y0 + Math.floor(cell / width) * step });
  const blocked = new Uint8Array(count), horizontal = new Uint8Array(count), vertical = new Uint8Array(count);
  for (let n = 0; n < count; n++) if (bodies.some(r => inside(point(n), r, 2))) blocked[n] = 1;
  const edgeUse = new Set<string>();
  const terminalCells = new Set(all.map(at));
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const costs = new Float64Array(count * 2), parents = new Int32Array(count * 2), visited = new Uint32Array(count * 2);
  let stamp = 0;
  const result = new Map<string, WireData>();
    const escape = (p: Vec, cell: number) => {
      if (!blocked[cell]) return [cell];
      const candidates: number[][] = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const path = [cell]; let q = point(cell);
        for (let n = 0; n < 100; n++) { q = { x: q.x + dx * step, y: q.y + dy * step }; const c = at(q); if (c < 0 || c >= count) break; path.push(c); if (!blocked[c]) { candidates.push(path); break; } }
      }
      candidates.sort((a, b) => a.length - b.length);
      if (!candidates.length) throw new Error(`No terminal exit at ${p.x},${p.y}`);
      return candidates[0];
    };
  const leads = new Map(all.map(p => [at(p), escape(p,at(p))]));
  for(const path of leads.values()) terminalCells.add(path.at(-1)!);
  // Short local jumpers establish the corridors before inter-board buses are threaded through them.
  const ordered = [...scene.wires].sort((a, b) => distance(a.a, a.b) - distance(b.a, b.b));
  for (const wire of ordered) {
    const start = at(wire.a), end = at(wire.b);
    const leadA = leads.get(start)!, leadB = leads.get(end)!;
    const source = leadA.at(-1)!, target = leadB.at(-1)!;
    stamp++;
    const queue = new Queue();
    for (let dir = 0; dir < 2; dir++) { const k = source * 2 + dir; visited[k] = stamp; costs[k] = 0; parents[k] = -1; queue.push({ key: k, cost: distance(point(source), point(target)) }); }
    let found = -1;
    while (queue.length) {
      const current = queue.pop().key, cell = current >> 1, dir = current & 1;
      if (cell === target) { found = current; break; }
      const p = point(cell);
      for (const [offset, nextDir] of [[-1, 0], [1, 0], [-width, 1], [width, 1]]) {
        const next = cell + offset;
        if (next < 0 || next >= count || Math.abs(next % width - cell % width) > 1 || blocked[next]) continue;
        if (next !== target && next !== source && terminalCells.has(next)) continue;
        const used = edgeUse.has(edgeKey(cell, next));
        if (used) continue;
        const cross = nextDir === 0 ? vertical[next] : horizontal[next];
        const board = boards.find(b => p.x >= b.x && p.x <= b.x + 680 && p.y >= b.y + 60 && p.y <= b.y + 170);
        const cost = costs[current] + step + (dir === nextDir ? 0 : 12) + (cross ? 9 : 0) + (board && nextDir === 0 ? 2 : 0);
        const key = next * 2 + nextDir;
        if (visited[key] === stamp && costs[key] <= cost) continue;
        visited[key] = stamp; costs[key] = cost; parents[key] = current;
        queue.push({ key, cost: cost + distance(point(next), point(target)) * 1.05 });
      }
    }
    if (found < 0) throw new Error(`No clear route for ${wire.id}: ${JSON.stringify([wire.a,wire.b])}`);
    const cells: number[] = [];
    for (let k = found; k >= 0; k = parents[k]) cells.push(k >> 1);
    cells.reverse();
    const path = [...leadA.slice(0, -1), ...cells, ...leadB.slice(0, -1).reverse()];
    for (let n = 1; n < path.length; n++) {
      edgeUse.add(edgeKey(path[n - 1], path[n]));
      const axis = Math.abs(path[n] - path[n - 1]) === 1 ? horizontal : vertical;
      axis[path[n - 1]] = 1; axis[path[n]] = 1;
    }
    const points: Vec[] = [];
    for (const cell of path) {
      const p = point(cell);
      while (points.length > 1) { const a = points.at(-2)!, b = points.at(-1)!; if (a.x === b.x && b.x === p.x || a.y === b.y && b.y === p.y) points.pop(); else break; }
      points.push(p);
    }
    // Headers can use sub-grid coordinates; their short lead stays orthogonal too.
    if (points[0].x !== wire.a.x || points[0].y !== wire.a.y) points.unshift(wire.a, { x: wire.a.x, y: points[0].y });
    if (points.at(-1)!.x !== wire.b.x || points.at(-1)!.y !== wire.b.y) points.push({ x: wire.b.x, y: points.at(-1)!.y }, wire.b);
    result.set(wire.id, { ...wire, points: points.slice(1, -1) });
  }
  return { ...scene, wires: scene.wires.map(w => result.get(w.id)!) };
}
