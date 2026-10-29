// Corriente por cada cable a partir de lo que entra en cada componente. Dentro de una red las
// conexiones (cables, tiras de la protoboard, patillas insertadas) forman un grafo; sobre un
// árbol de recubrimiento la corriente de cada tramo es la suma de lo que consume el subárbol
// que cuelga de él. Si hay mallas (dos cables en paralelo) la corriente va por uno solo: es
// una visualización, no una medida.
import { pinKey } from '../core/netlist';
import { toWorld, type CircuitSnapshot } from '../core/types';
import type { PartDef } from '../parts/types';

interface Edge {
  a: string;
  b: string;
  wire?: string;
}

/** Las mismas uniones que usa buildNetlist, pero conservando cada tramo. */
export function connectionEdges(snap: CircuitSnapshot, defs: Record<string, PartDef>): Edge[] {
  const edges: Edge[] = [];
  const sockets = new Map<string, string[]>();
  const legs: { key: string; part: string; at: string }[] = [];
  const known = new Set<string>();
  for (const part of snap.parts) {
    const def = defs[part.type];
    if (!def) continue;
    for (const pin of def.pins(part.props)) {
      const key = pinKey(part.id, pin.id);
      known.add(key);
      const w = toWorld(part, pin);
      const at = `${Math.round(w.x)},${Math.round(w.y)}`;
      if (pin.kind === 'socket') sockets.set(at, [...(sockets.get(at) ?? []), key]);
      else legs.push({ key, part: part.id, at });
    }
    for (const group of def.internal?.(part.props) ?? [])
      for (let i = 1; i < group.length; i++) edges.push({ a: pinKey(part.id, group[i - 1]), b: pinKey(part.id, group[i]) });
  }
  for (const leg of legs) for (const s of sockets.get(leg.at) ?? []) if (!s.startsWith(`${leg.part}:`)) edges.push({ a: leg.key, b: s });
  for (const w of snap.wires) {
    if (!w.a.part || !w.a.pin || !w.b.part || !w.b.pin) continue;
    const a = pinKey(w.a.part, w.a.pin);
    const b = pinKey(w.b.part, w.b.pin);
    if (known.has(a) && known.has(b)) edges.push({ a, b, wire: w.id });
  }
  return edges;
}

/**
 * Corriente de cada cable, positiva si va de su extremo a hacia b.
 * `into` es la corriente que sale de la red hacia el componente por cada pin.
 */
export function wireCurrents(edges: Edge[], into: Map<string, number>): Map<string, number> {
  const adj = new Map<string, { to: string; edge: Edge }[]>();
  const link = (from: string, to: string, edge: Edge) => {
    const list = adj.get(from);
    if (list) list.push({ to, edge });
    else adj.set(from, [{ to, edge }]);
  };
  // Los cables primero: en una malla se prefiere que la corriente se vea en ellos.
  for (const e of [...edges].sort((x, y) => Number(!!y.wire) - Number(!!x.wire))) {
    link(e.a, e.b, e);
    link(e.b, e.a, e);
  }

  const out = new Map<string, number>();
  const visited = new Set<string>();
  for (const root of adj.keys()) {
    if (visited.has(root)) continue;
    // Recorrido en anchura y luego hojas → raíz acumulando el consumo del subárbol.
    const order: string[] = [];
    const parent = new Map<string, { from: string; edge: Edge }>();
    visited.add(root);
    for (let q = [root]; q.length; ) {
      const next: string[] = [];
      for (const k of q) {
        order.push(k);
        for (const { to, edge } of adj.get(k) ?? []) {
          if (visited.has(to)) continue;
          visited.add(to);
          parent.set(to, { from: k, edge });
          next.push(to);
        }
      }
      q = next;
    }
    const sub = new Map<string, number>();
    for (let i = order.length - 1; i >= 0; i--) {
      const k = order[i];
      const total = (sub.get(k) ?? 0) + (into.get(k) ?? 0);
      const p = parent.get(k);
      if (!p) continue;
      sub.set(p.from, (sub.get(p.from) ?? 0) + total);
      // `total` va del padre hacia k.
      if (p.edge.wire) out.set(p.edge.wire, p.edge.a === p.from ? total : -total);
    }
  }
  return out;
}
