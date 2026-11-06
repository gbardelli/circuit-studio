import { elementDef } from './elements';
import type { LogicPinRef, LogicSheet } from './types';
import type { Vec } from '../core/types';

type Entry = { key: number; cost: number; score: number };
class Queue {
  private data: Entry[] = [];
  push(value: Entry) {
    const a = this.data; a.push(value); let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p].score <= value.score) break; a[i] = a[p]; i = p; } a[i] = value;
  }
  pop() {
    const a = this.data, first = a[0], last = a.pop();
    if (a.length && last) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1].score < a[c].score) c++;
        if (a[c].score >= last.score) break; a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return first;
  }
}

/** Route once when producing a design, not on the animation/render path. */
export function routeDesign(sheet: LogicSheet, lookup: (id: string) => LogicSheet | undefined) {
  if (!sheet.wires.length) return;
  const boxes = sheet.nodes.map(node => {
    const def = elementDef(node.kind, lookup)!;
    const ctx = { sheet: lookup, instantiate: () => null };
    return { node, ...def.size(node.props, ctx), pins: def.pins(node.props, ctx) };
  });
  const byId = new Map(boxes.map(b => [b.node.id, b]));
  const end = (ref: LogicPinRef) => {
    const box = byId.get(ref.node)!, pin = box.pins.find(p => p.id === ref.pin);
    if (!pin) throw new Error(`No existe la patilla ${ref.node}.${ref.pin}.`);
    return { x: box.node.x + pin.x, y: box.node.y + pin.y, dx: pin.x === 0 ? -1 : 1 };
  };
  const minX = Math.floor((Math.min(...boxes.map(b => b.node.x)) - 120) / 10);
  const minY = Math.floor((Math.min(...boxes.map(b => b.node.y)) - 120) / 10);
  const maxX = Math.ceil((Math.max(...boxes.map(b => b.node.x + b.w)) + 160) / 10);
  const maxY = Math.ceil((Math.max(...boxes.map(b => b.node.y + b.h)) + 160) / 10);
  const width = maxX - minX + 1, height = maxY - minY + 1;
  const cell = (x: number, y: number) => (y - minY) * width + x - minX;
  const point = (index: number): Vec => ({ x: ((index % width) + minX) * 10, y: (Math.floor(index / width) + minY) * 10 });
  const blocked = new Set<number>();
  for (const b of boxes) for (let x = Math.ceil((b.node.x - 8) / 10); x <= Math.floor((b.node.x + b.w + 8) / 10); x++) for (let y = Math.ceil((b.node.y - 8) / 10); y <= Math.floor((b.node.y + b.h + 8) / 10); y++) blocked.add(cell(x, y));
  const used = new Map<string, string>();
  const exits = new Map<number, string>();
  // Reserve every pin's approach before routing anything, so a short wire cannot trap
  // a later clock/reset connection against a block's body.
  for (const wire of sheet.wires) {
    const signal = `${wire.a.node}:${wire.a.pin}`;
    for (const ref of [wire.a, wire.b]) {
      const p = end(ref);
      let prev = cell(p.x / 10, p.y / 10);
      for (let step = 1; step <= 2; step++) {
        const next = cell(p.x / 10 + p.dx * step, p.y / 10);
        used.set(prev < next ? `${prev}:${next}` : `${next}:${prev}`, signal);
        exits.set(next, signal); prev = next;
      }
    }
  }
  const simplify = (points: Vec[]) => {
    const out: Vec[] = [];
    for (const p of points) {
      if (out.length && out.at(-1)!.x === p.x && out.at(-1)!.y === p.y) continue;
      while (out.length >= 2) {
        const a = out[out.length - 2], b = out[out.length - 1];
        if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop(); else break;
      }
      out.push(p);
    }
    return out;
  };
  // Short connections first, then the longer inter-stage buses.
  const ordered = [...sheet.wires].sort((a, b) => {
    const length = (w: typeof a) => { const p = end(w.a), q = end(w.b); return Math.abs(p.x - q.x) + Math.abs(p.y - q.y); };
    return length(a) - length(b);
  });
  for (const wire of ordered) {
    const a = end(wire.a), b = end(wire.b);
    const start = cell(a.x / 10 + a.dx * 2, a.y / 10), finish = cell(b.x / 10 + b.dx * 2, b.y / 10);
    const goal = point(finish), heap = new Queue(), costs = new Map<number, number>(), previous = new Map<number, number>();
    const origin = start * 4 + (a.dx > 0 ? 0 : 1);
    costs.set(origin, 0); heap.push({ key: origin, cost: 0, score: 0 });
    let found: number | undefined, budget = width * height * 4;
    const signal = `${wire.a.node}:${wire.a.pin}`;
    while (budget--) {
      const current = heap.pop(); if (!current) break;
      if (costs.get(current.key) !== current.cost) continue;
      const at = Math.floor(current.key / 4), direction = current.key % 4;
      if (at === finish) { found = current.key; break; }
      const x = at % width, y = Math.floor(at / width);
      for (const [dx, dy, dir] of [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (blocked.has(next) && next !== finish && next !== start) continue;
        if (exits.has(next) && exits.get(next) !== signal) continue;
        const edge = at < next ? `${at}:${next}` : `${next}:${at}`;
        const occupied = used.get(edge);
        if (occupied && occupied !== signal) continue;
        const cost = current.cost + 10 + (direction !== dir ? 14 : 0);
        const key = next * 4 + dir;
        if (cost >= (costs.get(key) ?? Infinity)) continue;
        const p = point(next);
        costs.set(key, cost); previous.set(key, current.key);
        heap.push({ key, cost, score: cost + Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) });
      }
    }
    if (found === undefined) throw new Error(`No se pudo trazar ${wire.label ?? wire.id}.`);
    const path: number[] = [];
    for (let key: number | undefined = found; key !== undefined; key = previous.get(key)) path.push(Math.floor(key / 4));
    path.reverse();
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]; used.set(a < b ? `${a}:${b}` : `${b}:${a}`, signal);
    }
    wire.points = simplify([a, ...path.map(point), b]).slice(1, -1).map(p => ({ x: p.x, y: p.y }));
    const name = wire.label ?? '';
    wire.color = /^(DEST|SEL)/.test(name) ? '#b692f6' : /^PISO/.test(name) ? '#53cbb8' : /^SP|^SEN|^CAPT/.test(name) ? '#61bb86' : /CLK|RESET/.test(name) ? '#adb6c3' : /SUBIR/.test(name) ? '#5ecb93' : /BAJAR/.test(name) ? '#ee7f8e' : /^PP|^PRI|PED/.test(name) ? '#e6bf6b' : '#7ea5db';
  }
}
