// Vista de esquema derivada del circuito real: no guarda conexiones propias, las saca de
// las redes (incluidas las que hace la protoboard). Solo la posición de cada símbolo
// (sx, sy, srot) se guarda en el documento compartido.
import { pinKey, type Netlist } from '../core/netlist';
import { snap, toWorld, type CircuitSnapshot, type PartData, type Vec } from '../core/types';
import { PARTS } from '../parts';
import { SCH_PREFIX } from '../parts/symbols';

export interface SchNet {
  id: number;
  kind: 'wire' | 'ground' | 'supply';
  label?: string;
  pins: Vec[];
  /** Hacia dónde sale cada pin del símbolo (unitario, en mundo), paralelo a pins. */
  dirs: Vec[];
  segments: Vec[][];
}

export interface Schematic {
  parts: PartData[];
  nets: SchNet[];
  pinPos: Map<string, Vec>;
}

const SUPPLY: Record<string, string> = { '5V': '5V', '5V.2': '5V', '5V.3': '5V', '3V3': '3.3V', VIN: 'VIN' };

export function buildSchematic(snapshot: CircuitSnapshot, netlist: Netlist): Schematic {
  const visible = snapshot.parts.filter((p) => PARTS[p.type] && PARTS[p.type].category !== 'Protoboards');

  // Pines con algo al otro lado (otra pieza visible en la misma red).
  const perNet = new Map<number, string[]>();
  for (const p of visible) {
    for (const pin of PARTS[p.type].pins(p.props)) {
      const key = pinKey(p.id, pin.id);
      const net = netlist.netOf.get(key);
      if (net === undefined) continue;
      const list = perNet.get(net);
      if (list) list.push(key);
      else perNet.set(net, [key]);
    }
  }
  // Solo cuentan las redes que unen piezas distintas, y de cada pieza un pin por red: los GND
  // de una placa (o SDA y A4) ya están unidos por dentro y bastaría con dibujar uno.
  const connected = new Set<string>();
  for (const [net, keys] of perNet) {
    const first = new Map<string, string>();
    for (const k of keys) {
      const part = k.slice(0, k.indexOf(':'));
      if (!first.has(part)) first.set(part, k);
    }
    if (first.size < 2) perNet.delete(net);
    else {
      perNet.set(net, [...first.values()]);
      first.forEach((k) => connected.add(k));
    }
  }

  const place = schematicPlacement(snapshot.parts);
  const parts: PartData[] = visible.map((p) => ({
    id: p.id,
    type: SCH_PREFIX + p.type,
    x: place.get(p.id)!.x,
    y: place.get(p.id)!.y,
    rot: p.srot ?? 0,
    props: {
      ...p.props,
      __pins: PARTS[p.type]
        .pins(p.props)
        .filter((pin) => connected.has(pinKey(p.id, pin.id)))
        .map((pin) => pin.id)
        .join(','),
    },
  }));

  const pinPos = new Map<string, Vec>();
  const pinDir = new Map<string, Vec>();
  for (const p of parts) {
    const def = PARTS[p.type];
    const b = def.bounds(p.props);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    for (const pin of def.pins(p.props)) {
      const key = pinKey(p.id, pin.id);
      pinPos.set(key, toWorld(p, pin));
      const dx = pin.x - cx;
      const dy = pin.y - cy;
      const local = Math.abs(dx) / b.w >= Math.abs(dy) / b.h ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
      pinDir.set(key, toWorld({ x: 0, y: 0, rot: p.rot }, local));
    }
  }

  // Redes de tierra: contienen un GND de placa o el negativo de una pila.
  const groundNets = new Set<number>();
  const supplyNets = new Map<number, string>();
  for (const p of visible) {
    const def = PARTS[p.type];
    for (const g of [...(def.ground ?? []), ...(def.reference ? [def.reference] : [])]) {
      const n = netlist.netOf.get(pinKey(p.id, g));
      if (n !== undefined) groundNets.add(n);
    }
    if (def.mcu)
      for (const [pin, label] of Object.entries(SUPPLY)) {
        const n = netlist.netOf.get(pinKey(p.id, pin));
        if (n !== undefined && (perNet.get(n)?.length ?? 0) > 1) supplyNets.set(n, label);
      }
  }

  const nets: SchNet[] = [];
  for (const [id, keys] of perNet) {
    if (keys.length < 2) continue;
    const live = keys.filter((k) => pinPos.has(k));
    const pins = live.map((k) => pinPos.get(k)!);
    const dirs = live.map((k) => pinDir.get(k)!);
    if (groundNets.has(id)) nets.push({ id, kind: 'ground', pins, dirs, segments: [] });
    else if (supplyNets.has(id)) nets.push({ id, kind: 'supply', label: supplyNets.get(id), pins, dirs, segments: [] });
    else {
      // Cada pin sale primero recto 10 unidades; el árbol une esos extremos.
      const tips = pins.map((p, i) => ({ x: p.x + dirs[i].x * 10, y: p.y + dirs[i].y * 10 }));
      nets.push({ id, kind: 'wire', pins, dirs, segments: [...pins.map((p, i) => [p, tips[i]]), ...route(tips)] });
    }
  }
  return { parts, nets, pinPos };
}

/**
 * Dónde va cada símbolo. Si alguien lo movió en el esquema, ahí (sx, sy). Si no, una
 * disposición compacta: placas en una columna a la izquierda y el resto en una rejilla a su
 * derecha, en el mismo orden en que están sobre la mesa.
 */
export function schematicPlacement(all: PartData[]): Map<string, Vec> {
  const visible = all.filter((p) => PARTS[p.type] && PARTS[p.type].category !== 'Protoboards');
  const out = new Map<string, Vec>();
  if (visible.length === 0) return out;
  const x0 = snap(Math.min(...visible.map((p) => p.x)));
  const y0 = snap(Math.min(...visible.map((p) => p.y)));
  const box = (p: PartData) => PARTS[SCH_PREFIX + p.type].bounds(p.props);
  const auto = visible.filter((p) => p.sx === undefined || p.sy === undefined);
  const boards = auto.filter((p) => PARTS[p.type].mcu).sort((a, b) => a.y - b.y);
  const rest = auto.filter((p) => !PARTS[p.type].mcu).sort((a, b) => a.x - b.x || a.y - b.y);

  let y = y0;
  let right = x0;
  for (const p of boards) {
    const b = box(p);
    out.set(p.id, { x: snap(x0 - b.x), y: snap(y - b.y) });
    y += b.h + 60;
    right = Math.max(right, x0 + b.w);
  }
  const ROWS = 3;
  const CELL_W = 110;
  const CELL_H = 90;
  const left = boards.length ? right + 120 : x0;
  rest.forEach((p, i) => {
    const b = box(p);
    const cx = left + Math.floor(i / ROWS) * CELL_W;
    const cy = y0 + (i % ROWS) * CELL_H;
    out.set(p.id, { x: snap(cx - b.x), y: snap(cy - b.y) });
  });
  for (const p of visible) if (p.sx !== undefined && p.sy !== undefined) out.set(p.id, { x: p.sx, y: p.sy });
  return out;
}

/** Movimientos en el esquema + la posición actual de los símbolos que aún no tenían una fija,
 *  para que mover uno no recoloque al resto de la rejilla automática. */
export function withFrozenPlacement(all: PartData[], moves: { id: string; x: number; y: number }[]) {
  const place = schematicPlacement(all);
  const moved = new Set(moves.map((m) => m.id));
  const frozen = all.filter((p) => !moved.has(p.id) && place.has(p.id) && (p.sx === undefined || p.sy === undefined)).map((p) => ({ id: p.id, ...place.get(p.id)! }));
  return [...moves, ...frozen];
}

/** Árbol de recubrimiento mínimo (Prim, distancia Manhattan) con tramos en L. */
function route(pins: Vec[]): Vec[][] {
  const unique = pins.filter((p, i) => pins.findIndex((q) => q.x === p.x && q.y === p.y) === i);
  if (unique.length < 2) return [];
  const inTree = [unique[0]];
  const rest = unique.slice(1);
  const out: Vec[][] = [];
  while (rest.length) {
    let best = { d: Infinity, from: inTree[0], idx: 0 };
    for (const a of inTree)
      rest.forEach((b, idx) => {
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (d < best.d) best = { d, from: a, idx };
      });
    const b = rest.splice(best.idx, 1)[0];
    const a = best.from;
    out.push(a.x === b.x || a.y === b.y ? [a, b] : [a, { x: b.x, y: a.y }, b]);
    inTree.push(b);
  }
  return out;
}
