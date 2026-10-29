// Deriva las redes eléctricas del dibujo. Las redes nunca se guardan: se recalculan,
// así la topología no puede contradecir lo que se ve.
import type { PartDef } from '../parts/types';
import { toWorld, type CircuitSnapshot, type Vec } from './types';

export const pinKey = (part: string, pin: string) => `${part}:${pin}`;

class UnionFind {
  parent = new Map<string, string>();
  find(k: string): string {
    if (!this.parent.has(k)) {
      this.parent.set(k, k);
      return k;
    }
    let root = k;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = k;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export interface Netlist {
  /** pinKey → índice de red */
  netOf: Map<string, number>;
  netCount: number;
  pinWorld: Map<string, Vec>;
  /** Patillas insertadas en un orificio: pinKey de la patilla → pinKey del orificio. */
  inserted: Map<string, string>;
}

export function buildNetlist(snap: CircuitSnapshot, defs: Record<string, PartDef>): Netlist {
  const uf = new UnionFind();
  const pinWorld = new Map<string, Vec>();
  const sockets = new Map<string, string[]>();
  const legs: { key: string; part: string; pos: Vec }[] = [];
  const inserted = new Map<string, string>();

  for (const part of snap.parts) {
    const def = defs[part.type];
    if (!def) continue;
    for (const pin of def.pins(part.props)) {
      const key = pinKey(part.id, pin.id);
      const pos = toWorld(part, pin);
      pinWorld.set(key, pos);
      uf.find(key);
      const at = `${Math.round(pos.x)},${Math.round(pos.y)}`;
      if (pin.kind === 'socket') {
        const list = sockets.get(at);
        if (list) list.push(key);
        else sockets.set(at, [key]);
      } else {
        legs.push({ key, part: part.id, pos });
      }
    }
    for (const group of def.internal?.(part.props) ?? []) {
      for (let i = 1; i < group.length; i++) uf.union(pinKey(part.id, group[0]), pinKey(part.id, group[i]));
    }
  }

  // Patilla sobre orificio = conexión (como en una protoboard real).
  for (const leg of legs) {
    const list = sockets.get(`${Math.round(leg.pos.x)},${Math.round(leg.pos.y)}`);
    if (!list) continue;
    for (const s of list) {
      if (s.startsWith(`${leg.part}:`)) continue;
      uf.union(leg.key, s);
      inserted.set(leg.key, s);
    }
  }

  for (const wire of snap.wires) {
    if (wire.a.part && wire.a.pin && wire.b.part && wire.b.pin) {
      const ka = pinKey(wire.a.part, wire.a.pin);
      const kb = pinKey(wire.b.part, wire.b.pin);
      if (pinWorld.has(ka) && pinWorld.has(kb)) uf.union(ka, kb);
    }
  }

  const netOf = new Map<string, number>();
  const ids = new Map<string, number>();
  for (const key of pinWorld.keys()) {
    const root = uf.find(key);
    let id = ids.get(root);
    if (id === undefined) {
      id = ids.size;
      ids.set(root, id);
    }
    netOf.set(key, id);
  }
  return { netOf, netCount: ids.size, pinWorld, inserted };
}
