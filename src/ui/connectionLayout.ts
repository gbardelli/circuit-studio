import { buildNetlist } from '../core/netlist';
import type { CircuitSnapshot, Vec } from '../core/types';
import { PARTS } from '../parts';
import { endPosition, partBounds, wirePoints } from './geometry';

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
export function simplifyRoute(points: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of points) {
    if (out.length && same(out[out.length - 1], p)) continue;
    while (out.length > 1) {
      const a = out[out.length - 2], b = out[out.length - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

/** Packs upright boards by column. Inserted parts move with their sockets, never independently. */
export function compactConnections(input: CircuitSnapshot): CircuitSnapshot {
  const boards = input.parts.filter(p => p.type.startsWith('breadboard') && p.rot === 0);
  const moves = new Map<string, number>();
  const columns = new Map<number, typeof boards>();
  for (const b of boards) columns.set(b.x, [...(columns.get(b.x) ?? []), b]);
  for (const stack of columns.values()) {
    stack.sort((a, b) => a.y - b.y);
    let y = stack[0].y;
    for (const b of stack) {
      moves.set(b.id, y - b.y);
      y += partBounds(b).h + 20;
    }
  }
  const oldNets = buildNetlist(input, PARTS);
  const mounted = new Map<string, number>();
  for (const [leg, socket] of oldNets.inserted) {
    const id = leg.slice(0, leg.lastIndexOf(':'));
    const board = socket.slice(0, socket.lastIndexOf(':'));
    if (moves.has(board)) {
      const dy = moves.get(board)!;
      if (mounted.has(id) && mounted.get(id) !== dy) throw new Error('Una pieza une dos placas. Ordénalas manualmente.');
      mounted.set(id, dy);
    }
  }
  // A part can sit on a board without its own pins exactly matching a socket, e.g. a display.
  const parts = input.parts.map(p => {
    let dy = moves.get(p.id) ?? mounted.get(p.id);
    if (dy === undefined && !p.type.startsWith('breadboard')) {
      const owner = boards.find(b => {
        const box = partBounds(b), pb = partBounds(p);
        return pb.x >= box.x && pb.x + pb.w <= box.x + box.w && p.y >= b.y && p.y < b.y + box.h;
      });
      if (owner) dy = moves.get(owner.id);
    }
    return dy ? { ...p, y: p.y + dy } : p;
  });
  const sorted = [...boards].sort((a, b) => a.y - b.y);
  const mapY = (y: number) => {
    for (const b of sorted) {
      const h = partBounds(b).h;
      if (y >= b.y && y <= b.y + h) return y + moves.get(b.id)!;
    }
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i], edge = a.y + partBounds(a).h;
      if (y > edge && y < b.y) {
        const t = (y - edge) / (b.y - edge);
        return edge + moves.get(a.id)! + t * (b.y + moves.get(b.id)! - edge - moves.get(a.id)!);
      }
    }
    const last = sorted.at(-1);
    return last && y > last.y ? y + moves.get(last.id)! : y;
  };
  const byId = new Map(parts.map(p => [p.id, p]));
  const wires = input.wires.map(w => {
    const external = [w.a,w.b].every(end => {
      const p = input.parts.find(p => p.id === end.part);
      return p && partBounds(p).x + partBounds(p).w < Math.min(...boards.map(b=>b.x));
    });
    return { ...w, points: external ? w.points : w.points.map(p => ({ x: p.x, y: mapY(p.y) })) };
  });
  const bad = new Set(wires.filter(w => wirePoints(w, byId).some((p, i, ps) => i > 0 && Math.abs(p.x - ps[i - 1].x) > .01 && Math.abs(p.y - ps[i - 1].y) > .01)).map(w => w.id));
  const router = new OrthogonalRouter(parts);
  // Keep well-routed existing work, but reserve its tracks before repairing stale bends.
  for (const w of wires) if (!bad.has(w.id)) router.reserve(wirePoints(w, byId));
  for (const w of wires) {
    if (w.sch || !bad.has(w.id)) continue;
    const a = endPosition(w.a, byId), b = endPosition(w.b, byId);
    w.points = router.route(a, b).slice(1, -1);
  }
  const output = { parts, wires };
  const next = buildNetlist(output, PARTS);
  // Socket coincidence is electrical connectivity. Refuse any change that alters it.
  for (const [leg, socket] of oldNets.inserted) if (next.inserted.get(leg) !== socket) throw new Error('No se pudo ordenar sin alterar una conexión insertada.');
  for (const [leg, socket] of next.inserted) if (oldNets.inserted.get(leg) !== socket) throw new Error('El nuevo montaje produciría una conexión adicional.');
  return output;
}

/** Grid routing with bend, crossing and shared-track costs. Parts are obstacles, boards are not. */
export class OrthogonalRouter {
  private occupied = new Map<string, number>();
  private horizontal = new Set<string>();
  private vertical = new Set<string>();
  private blockedCells = new Set<string>();
  private boxes: ReturnType<typeof partBounds>[];
  private bounds: { left: number; top: number; right: number; bottom: number };
  constructor(parts: CircuitSnapshot['parts'], private spaced = false) {
    const all = parts.map(partBounds);
    this.boxes = parts.filter(p => !p.type.startsWith('breadboard')).map(p => {
      const b = partBounds(p);
      if (!this.spaced) return b;
      if (/^(74hc|cd4|ne555)/.test(p.type)) return { x:b.x+3, y:b.y+5, w:b.w-6, h:b.h-10 };
      if (p.type === 'resistor') return p.rot === 90 || p.rot === 270 ? {x:b.x+1,y:b.y+9,w:b.w-2,h:b.h-18} : {x:b.x+9,y:b.y+1,w:b.w-18,h:b.h-2};
      if (p.type === 'led' || p.type === 'capacitor') return { ...b, h:b.h-9 };
      return b;
    }).map(b => ({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 }));
    if(this.spaced) for(const p of parts) if(p.type.startsWith('breadboard') && p.props.label) {
      this.boxes.push({x:p.x,y:p.y-44,w:Math.min(partBounds(p).w,String(p.props.label).length*10+20),h:30});
    }
    for(const box of this.boxes) for(let x=Math.floor(box.x/5);x<=Math.ceil((box.x+box.w)/5);x++) for(let y=Math.floor(box.y/5);y<=Math.ceil((box.y+box.h)/5);y++) {
      if(x*5>box.x && x*5<box.x+box.w && y*5>box.y && y*5<box.y+box.h) this.blockedCells.add(this.key(x,y));
    }
    this.bounds = { left: Math.floor((Math.min(...all.map(b => b.x)) - 100) / 5), top: Math.floor((Math.min(...all.map(b => b.y)) - 80) / 5), right: Math.ceil((Math.max(...all.map(b => b.x + b.w)) + 140) / 5), bottom: Math.ceil((Math.max(...all.map(b => b.y + b.h)) + 80) / 5) };
  }
  private key(x: number, y: number) { return `${x},${y}`; }
  reserve(points: Vec[]) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let t = 0; t <= len; t += 5) {
        const key = this.key(Math.round((a.x + (b.x - a.x) * t / (len || 1)) / 5), Math.round((a.y + (b.y - a.y) * t / (len || 1)) / 5));
        this.occupied.set(key, (this.occupied.get(key) ?? 0) + 1);
        (Math.abs(a.y-b.y)<.01 ? this.horizontal : this.vertical).add(key);
      }
    }
  }
  route(a: Vec, b: Vec): Vec[] {
    const escape = (p: Vec): Vec => {
      if(!this.spaced) return p;
      let pos = {x:Math.round(p.x/5)*5,y:Math.round(p.y/5)*5};
      for(let tries=0;tries<8 && this.blockedCells.has(this.key(pos.x/5,pos.y/5));tries++) {
        const candidates: Vec[] = [];
        for(const box of this.boxes) if(pos.x>box.x && pos.x<box.x+box.w && pos.y>box.y && pos.y<box.y+box.h) {
          candidates.push({x:Math.floor(box.x/5)*5,y:pos.y},{x:Math.ceil((box.x+box.w)/5)*5,y:pos.y},{x:pos.x,y:Math.floor(box.y/5)*5},{x:pos.x,y:Math.ceil((box.y+box.h)/5)*5});
        }
        candidates.sort((a,b)=>Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y));
        pos = candidates.find(c=>!this.blockedCells.has(this.key(c.x/5,c.y/5))) ?? candidates[0] ?? pos;
      }
      return pos;
    };
    const escapeA=escape(a), escapeB=escape(b);
    const start = { x: Math.round(escapeA.x / 5), y: Math.round(escapeA.y / 5) }, goal = { x: Math.round(escapeB.x / 5), y: Math.round(escapeB.y / 5) };
    const endpointBoxes = this.boxes.filter(box => [a,b].some(p => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h));
    const blocked = (x: number, y: number) => this.spaced ? this.blockedCells.has(this.key(x,y)) : this.boxes.some(box => !endpointBoxes.includes(box) && x * 5 > box.x && x * 5 < box.x + box.w && y * 5 > box.y && y * 5 < box.y + box.h);
    type Node = { x: number; y: number; dir: number; g: number; f: number; prev?: Node };
    const heap: Node[] = [], costs = new Map<string, number>();
    const push = (n: Node) => { heap.push(n); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].f <= n.f) break; heap[i] = heap[p]; i = p; } heap[i] = n; };
    const pop = () => { const first = heap[0], tail = heap.pop()!; if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[c].f >= tail.f) break; heap[i] = heap[c]; i = c; } heap[i] = tail; } return first; };
    const estimate = (x: number, y: number) => Math.abs(goal.x - x) + Math.abs(goal.y - y);
    push({ ...start, dir: -1, g: 0, f: estimate(start.x, start.y) });
    const dirs = [[1,0], [0,1], [-1,0], [0,-1]];
    let end: Node | undefined;
    while (heap.length) {
      const n = pop(), key = `${n.x},${n.y},${n.dir}`;
      if ((costs.get(key) ?? Infinity) < n.g) continue;
      if (n.x === goal.x && n.y === goal.y) { end = n; break; }
      for (let dir = 0; dir < 4; dir++) {
        if (n.dir >= 0 && (dir + 2) % 4 === n.dir) continue;
        const x = n.x + dirs[dir][0], y = n.y + dirs[dir][1], bounds = this.bounds;
        if (x < Math.min(bounds.left, start.x, goal.x) || x > Math.max(bounds.right, start.x, goal.x) || y < Math.min(bounds.top, start.y, goal.y) || y > Math.max(bounds.bottom, start.y, goal.y) || blocked(x,y)) continue;
        const occupied = this.occupied.get(this.key(x,y)) ?? 0;
        const horizontal = dir % 2 === 0, own = horizontal ? this.horizontal : this.vertical;
        const parallel = own.has(this.key(x,y));
        const nearby = horizontal ? own.has(this.key(x,y-1)) || own.has(this.key(x,y+1)) : own.has(this.key(x-1,y)) || own.has(this.key(x+1,y));
        const congestion = this.spaced ? (parallel ? 55 : occupied ? 9 : nearby ? 5 : 0) : occupied*8;
        const g = n.g + 1 + (n.dir >= 0 && dir !== n.dir ? (this.spaced ? 9 : 5) : 0) + congestion;
        const k = `${x},${y},${dir}`;
        if (g >= (costs.get(k) ?? Infinity)) continue;
        costs.set(k,g); push({ x,y,dir,g,f:g + estimate(x,y),prev:n });
      }
    }
    if (!end) throw new Error('No hay un recorrido libre para todos los cables.');
    const path: Vec[] = [];
    for (let n: Node | undefined = end; n; n = n.prev) path.push({ x: n.x * 5, y: n.y * 5 });
    path.reverse();
    // Exact endpoints are retained even when imported coordinates are off the routing grid.
    const first = path[0], last = path[path.length - 1];
    const result = simplifyRoute([a, { x: first.x, y: a.y }, ...path, { x: last.x, y: b.y }, b]);
    this.reserve(result); return result;
  }
}
