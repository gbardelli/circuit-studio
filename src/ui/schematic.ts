// Vista de esquema derivada del circuito real: no guarda conexiones propias, las saca de las
// redes (incluidas las que hace la protoboard). Solo la posición de cada símbolo (sx, sy, srot)
// se guarda en el documento compartido.
//
// Se dibuja como en un programa de diseño electrónico:
// · La señal fluye de izquierda a derecha: columnas por profundidad (entradas → lógica → salidas)
//   y, dentro de cada columna, el orden que menos cruza.
// · Símbolos funcionales: entradas a la izquierda, salidas a la derecha, alimentación implícita.
// · Designadores (U1, R3, SW2…) y valores.
// · Cables ortogonales por los canales entre columnas, cada red en su carril. Lo que viaja lejos o
//   vuelve hacia atrás se une por etiquetas de red con nombre, no con un cable que cruce la hoja.
import { pinKey, type Netlist } from '../core/netlist';
import { snap, toWorld, type CircuitSnapshot, type PartData, type Props, type Rotation, type Vec } from '../core/types';
import { PARTS } from '../parts';
import { SCH_PREFIX } from '../parts/symbols';
import type { PinRole } from '../parts/types';

export interface SchFlag {
  at: Vec;
  dir: Vec;
  text: string;
}

export interface SchNet {
  id: number;
  kind: 'wire' | 'ground' | 'supply';
  label?: string;
  pins: Vec[];
  /** Hacia dónde sale cada pin del símbolo (unitario, en mundo), paralelo a pins. */
  dirs: Vec[];
  segments: Vec[][];
  /** Uniones en T (punto de conexión). */
  dots?: Vec[];
  /** Etiquetas de red en las puntas de los pines (redes que no se unen con cable). */
  flags?: SchFlag[];
}

export interface Schematic {
  parts: PartData[];
  nets: SchNet[];
  pinPos: Map<string, Vec>;
  /** Marco de la hoja. */
  sheet: { x: number; y: number; w: number; h: number };
}

type Kind = 'source' | 'logic' | 'pass' | 'sink';

const STUB = 8;
const TRACK = 6;
/** Tronco más largo que se dibuja; más allá, etiquetas de red. */
const MAX_TRUNK = 320;
/** Ancho de la banderola de una etiqueta (igual que en el lienzo). */
export const flagWidth = (text: string) => Math.max(18, text.length * 3.55 + 9) + 4;

const SOURCES = new Set(['pushbutton', 'slide-switch', 'dip-switch-4', 'dip-switch-6', 'dip-switch-8', 'clock', 'bench-supply', 'battery-9v', 'aa-pack', 'potentiometer', 'ldr']);
const PASSIVES = new Set(['resistor', 'capacitor', 'diode']);
const SINKS = new Set(['led', 'seven-segment', 'buzzer', 'dc-motor', 'servo', 'rgb-led', 'led-bar-10']);
const SYMBOL_TYPES = new Set(['bench-supply', 'resistor', 'led', 'diode', 'capacitor', 'potentiometer', 'ldr', 'pushbutton', 'slide-switch', 'battery-9v', 'aa-pack', 'npn', 'mosfet-n', 'dc-motor', 'buzzer', 'dip-switch-4', 'dip-switch-6', 'dip-switch-8']);

function kindOf(type: string): Kind {
  if (SOURCES.has(type)) return 'source';
  if (PASSIVES.has(type)) return 'pass';
  if (SINKS.has(type)) return 'sink';
  return 'logic';
}

function roleOf(p: PartData, id: string): PinRole {
  const def = PARTS[p.type];
  if (def.pinRole) return def.pinRole(id);
  if (def.mcu) {
    if (/^GND/.test(id)) return 'ground';
    if (/^(5V|3V3|VIN|IOREF|AREF)/.test(id)) return 'power';
    return 'bidir';
  }
  switch (p.type) {
    case 'led':
      return id === 'A' ? 'in' : 'passive';
    case 'seven-segment':
      return /^COM/.test(id) ? 'passive' : 'in';
    case 'clock':
      return id === 'OUT' ? 'out' : 'ground';
    case 'nextion-28':
      return id === 'TX' ? 'out' : id === 'RX' ? 'in' : id === 'GND' ? 'ground' : 'power';
  }
  return kindOf(p.type) === 'sink' ? 'in' : 'passive';
}

/** Prefijo del designador según el tipo de pieza. */
function refPrefix(type: string): string {
  const def = PARTS[type];
  if (def.mcu) return 'A';
  if (type === 'resistor' || type === 'ldr') return 'R';
  if (type === 'potentiometer') return 'RV';
  if (type === 'capacitor') return 'C';
  if (type === 'led' || type === 'diode' || type === 'rgb-led') return 'D';
  if (type === 'seven-segment' || type === 'led-bar-10') return 'DS';
  if (type === 'npn' || type === 'mosfet-n') return 'Q';
  if (type === 'pushbutton' || /switch/.test(type)) return 'SW';
  if (type === 'clock') return 'G';
  if (type === 'bench-supply' || type.startsWith('battery') || type === 'aa-pack') return 'BT';
  if (def.category === 'Lógica' || def.category === 'Integrados') return 'U';
  return 'M';
}

/** Orden natural (D2 antes que D10) con los pines de datos antes que los de control. */
function pinOrder(a: string, b: string) {
  const data = (s: string) => (/^(\d?[A-DIQSY]\d*|[DQAB]\d|I\d|S[A-G]|Q\d)$/.test(s.replace(/\.\d+$/, '')) ? 0 : 1);
  return data(a) - data(b) || a.localeCompare(b, 'en', { numeric: true });
}

/** Filas del símbolo funcional: cada puerta o biestable (prefijo numérico) en su franja. */
function boxRows(p: PartData, shown: string[]) {
  const groups = new Map<string, { left: string[]; right: string[] }>();
  for (const id of shown) {
    const role = roleOf(p, id);
    const g = /^(\d)/.exec(id)?.[1] ?? '';
    const entry = groups.get(g) ?? { left: [], right: [] };
    (role === 'in' ? entry.left : entry.right).push(id);
    groups.set(g, entry);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const left: string[] = [];
  const right: string[] = [];
  keys.forEach((k, i) => {
    const g = groups.get(k)!;
    g.left.sort(pinOrder);
    g.right.sort(pinOrder);
    const n = Math.max(g.left.length, g.right.length);
    if (i > 0 && keys.length > 1) {
      left.push('');
      right.push('');
    }
    for (let r = 0; r < n; r++) {
      left.push(g.left[r] ?? '');
      right.push(g.right[r] ?? '');
    }
  });
  return { left, right };
}

// La última colocación automática: mover o rotar un símbolo congela a los demás donde estaban.
let lastAuto = new Map<string, Vec>();

export function buildSchematic(snapshot: CircuitSnapshot, netlist: Netlist): Schematic {
  const visible = snapshot.parts.filter((p) => PARTS[p.type] && PARTS[p.type].category !== 'Protoboards');
  const byId = new Map(visible.map((p) => [p.id, p]));

  // ── Redes: pines con algo al otro lado, con los alias internos de una pieza juntos ──────
  const perNet = new Map<number, string[]>();
  const aliases = new Map<string, string>();
  for (const p of visible) {
    for (const group of PARTS[p.type].internal?.(p.props) ?? []) for (const id of group) aliases.set(pinKey(p.id, id), pinKey(p.id, group[0]));
    for (const pin of PARTS[p.type].pins(p.props)) {
      const key = pinKey(p.id, pin.id);
      const net = netlist.netOf.get(key);
      if (net === undefined) continue;
      const list = perNet.get(net);
      if (list) list.push(key);
      else perNet.set(net, [key]);
    }
  }
  // Solo se colapsan los pines unidos dentro de una pieza: dos entradas de un mismo chip
  // atadas entre sí, o una realimentación, deben verse.
  const connected = new Set<string>();
  for (const [net, keys] of perNet) {
    const first = new Map<string, string>();
    for (const k of keys) {
      const canonical = aliases.get(k) ?? k;
      if (!first.has(canonical)) first.set(canonical, k);
    }
    if (first.size < 2) perNet.delete(net);
    else {
      perNet.set(net, [...first.values()]);
      first.forEach((k) => connected.add(k));
    }
  }
  const split = (key: string) => {
    const i = key.indexOf(':');
    return { part: key.slice(0, i), pin: key.slice(i + 1) };
  };

  // ── Tierra y alimentación ───────────────────────────────────────────────────────────
  const groundNets = new Set<number>();
  const supplyNets = new Map<number, string>();
  for (const p of visible) {
    const def = PARTS[p.type];
    for (const g of [...(def.ground ?? []), ...(def.reference ? [def.reference] : [])]) {
      const n = netlist.netOf.get(pinKey(p.id, g));
      if (n !== undefined) groundNets.add(n);
    }
  }
  for (const [net, keys] of perNet) {
    if (groundNets.has(net)) continue;
    let label: string | null = null;
    for (const k of keys) {
      const { part, pin } = split(k);
      const p = byId.get(part)!;
      const role = roleOf(p, pin);
      if (PARTS[p.type].mcu && role === 'power') label = pin.startsWith('3V3') ? '+3V3' : pin.startsWith('5V') ? '+5V' : pin;
      else if ((p.type === 'bench-supply' || p.type.startsWith('battery')) && pin === '+') label ??= `+${Number(p.props.voltage ?? 9)}V`;
      else if (role === 'power') label ??= 'VCC';
    }
    if (label) supplyNets.set(net, label);
  }
  const railNet = (n: number | undefined) => n !== undefined && (groundNets.has(n) || supplyNets.has(n));

  // ── Designadores ────────────────────────────────────────────────────────────────────
  const refs = new Map<string, string>();
  const used = new Set<string>();
  for (const p of visible) {
    const m = /^([A-Z]{1,3}\d+)\b/.exec(String(p.props.label ?? ''));
    if (m && !used.has(m[1])) {
      refs.set(p.id, m[1]);
      used.add(m[1]);
    }
  }
  const counters = new Map<string, number>();
  for (const p of [...visible].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (refs.has(p.id)) continue;
    const prefix = refPrefix(p.type);
    let n = counters.get(prefix) ?? 1;
    while (used.has(`${prefix}${n}`)) n++;
    refs.set(p.id, `${prefix}${n}`);
    used.add(`${prefix}${n}`);
    counters.set(prefix, n + 1);
  }

  // ── Símbolos: qué pines se ven y en qué fila ───────────────────────────────────────
  const symbolProps = new Map<string, Props>();
  for (const p of visible) {
    const def = PARTS[p.type];
    const pins = def.pins(p.props);
    const isConnected = (id: string) => connected.has(pinKey(p.id, id));
    const extra: Props = { __ref: refs.get(p.id)! };
    if (def.pinRole) {
      // Integrado: alimentación implícita (como en las librerías de los programas de CAD).
      const shown = pins.filter((q) => isConnected(q.id) && !['power', 'ground', 'nc'].includes(def.pinRole!(q.id))).map((q) => q.id);
      const { left, right } = boxRows(p, shown);
      extra.__left = left.join(',');
      extra.__right = right.join(',');
      extra.__num = pins.map((q, i) => `${q.id}=${i + 1}`).join(',');
      extra.__power = pins
        .map((q, i) => ({ q, i, role: def.pinRole!(q.id) }))
        .filter((x) => x.role === 'power' || x.role === 'ground')
        .map((x) => `${x.q.id.replace(/\.\d+$/, '')} ${x.i + 1}`)
        .join(' · ');
    } else if (!SYMBOL_TYPES.has(p.type)) {
      const shown = pins.filter((q) => isConnected(q.id)).map((q) => q.id);
      const { left, right } = boxRows(p, pins.length > 24 ? shown : pins.map((q) => q.id));
      extra.__left = left.join(',');
      extra.__right = right.join(',');
    }
    symbolProps.set(p.id, { ...p.props, ...extra });
  }
  const box = (p: PartData) => PARTS[SCH_PREFIX + p.type].bounds(symbolProps.get(p.id)!);
  const symPins = (p: PartData) => PARTS[SCH_PREFIX + p.type].pins(symbolProps.get(p.id)!);

  // ── Colocación automática por flujo de señal ───────────────────────────────────────
  const rot = new Map<string, Rotation>(visible.map((p) => [p.id, (p.srot ?? 0) as Rotation]));
  const auto = autoPlacement(visible, perNet, split, railNet, netlist, box, symPins, rot, byId);
  lastAuto = auto;
  const place = (p: PartData) => (p.sx !== undefined && p.sy !== undefined ? { x: p.sx, y: p.sy } : auto.get(p.id)!);

  const parts: PartData[] = visible.map((p) => ({
    id: p.id,
    type: SCH_PREFIX + p.type,
    x: place(p).x,
    y: place(p).y,
    rot: rot.get(p.id)!,
    props: symbolProps.get(p.id)!,
  }));

  // ── Posición y sentido de cada pin ─────────────────────────────────────────────────
  const pinPos = new Map<string, Vec>();
  const pinDir = new Map<string, Vec>();
  const boxes: Box[] = [];
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
      const w = toWorld({ x: 0, y: 0, rot: p.rot }, local);
      pinDir.set(key, { x: Math.round(w.x), y: Math.round(w.y) });
    }
    const c = [toWorld(p, { x: b.x, y: b.y }), toWorld(p, { x: b.x + b.w, y: b.y + b.h })];
    boxes.push({ id: p.id, x0: Math.min(c[0].x, c[1].x), y0: Math.min(c[0].y, c[1].y), x1: Math.max(c[0].x, c[1].x), y1: Math.max(c[0].y, c[1].y) });
  }

  // ── Columnas reales (también si alguien movió símbolos) y sus canales ─────────────
  const columns = clusterColumns(boxes);
  const colOf = new Map<string, number>();
  columns.forEach((c, i) => c.ids.forEach((id) => colOf.set(id, i)));
  const channels = columns.map((c, i) => ({ x0: i === 0 ? c.x0 - 80 : columns[i - 1].x1, x1: c.x0, used: [] as [number, number][][] }));
  channels.push({ x0: columns[columns.length - 1]?.x1 ?? 0, x1: (columns[columns.length - 1]?.x1 ?? 0) + 80, used: [] });

  // ── Nombres de red: los que pone la plantilla (props.nets) o el pin que la gobierna ─────
  const netName = (keys: string[]) => {
    for (const k of keys) {
      const { part, pin } = split(k);
      const named = String(byId.get(part)?.props.nets ?? '')
        .split(';')
        .map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])
        .find(([pinId]) => pinId === pin);
      if (named?.[1]) return named[1];
    }
    const driver = keys.find((k) => roleOf(byId.get(split(k).part)!, split(k).pin) === 'out') ?? keys[0];
    const { part, pin } = split(driver);
    return `${refs.get(part)}·${pin.replace(/\.\d+$/, '')}`;
  };

  // Dos pasadas: primero se decide qué redes van por etiqueta (y dónde quedan las banderolas);
  // después los troncos eligen carriles que no pasen por detrás de ninguna.
  interface Pending {
    id: number;
    live: string[];
    pins: Vec[];
    dirs: Vec[];
    tips: Vec[];
    want: number[];
  }
  const nets: SchNet[] = [];
  const pending: Pending[] = [];
  for (const [id, keys] of perNet) {
    const live = keys.filter((k) => pinPos.has(k));
    if (live.length < 2) continue;
    const pins = live.map((k) => pinPos.get(k)!);
    const dirs = live.map((k) => pinDir.get(k)!);
    if (groundNets.has(id)) {
      nets.push({ id, kind: 'ground', pins, dirs, segments: [] });
      continue;
    }
    if (supplyNets.has(id)) {
      nets.push({ id, kind: 'supply', label: supplyNets.get(id), pins, dirs, segments: [] });
      continue;
    }
    const tips = pins.map((p, i) => ({ x: p.x + dirs[i].x * STUB, y: p.y + dirs[i].y * STUB }));
    // Canal al que mira cada pin: a la derecha de su columna o a la izquierda.
    const want = live.map((k, i) => {
      if (dirs[i].y !== 0) return -1;
      const col = colOf.get(split(k).part) ?? 0;
      return dirs[i].x > 0 ? col + 1 : col;
    });
    pending.push({ id, live, pins, dirs, tips, want });
  }
  const canWire = (n: Pending) => n.want[0] >= 0 && n.want.every((w) => w === n.want[0]) && Math.max(...n.tips.map((t) => t.y)) - Math.min(...n.tips.map((t) => t.y)) <= MAX_TRUNK;
  const flagged = new Set(pending.filter((n) => !canWire(n)).map((n) => n.id));
  const blockers: Box[] = [];
  const flagBox = (at: Vec, dir: Vec, text: string): Box => {
    const w = flagWidth(text) + 6;
    return dir.x >= 0 ? { id: '', x0: at.x, y0: at.y - 6, x1: at.x + w, y1: at.y + 6 } : { id: '', x0: at.x - w, y0: at.y - 6, x1: at.x, y1: at.y + 6 };
  };
  const names = new Map(pending.map((n) => [n.id, netName(n.live)]));
  for (const n of pending) if (flagged.has(n.id)) n.tips.forEach((t, i) => blockers.push(flagBox(t, n.dirs[i], names.get(n.id)!)));
  for (const n of pending) {
    const stubs = n.pins.map((p, i) => [p, n.tips[i]]);
    const wired = flagged.has(n.id) ? null : routeInChannel(n.want, n.tips, channels, blockers);
    if (wired) {
      nets.push({ id: n.id, kind: 'wire', pins: n.pins, dirs: n.dirs, segments: [...stubs, ...wired.segments], dots: wired.dots });
    } else {
      const text = names.get(n.id)!;
      nets.push({ id: n.id, kind: 'wire', label: text, pins: n.pins, dirs: n.dirs, segments: stubs, flags: n.tips.map((at, i) => ({ at, dir: n.dirs[i], text })) });
    }
  }

  // ── Hoja: todo lo dibujado más un margen y el cajetín ──────────────────────────────
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const b of boxes) {
    grow(b.x0, b.y0);
    grow(b.x1, b.y1);
  }
  for (const n of nets) {
    for (const s of n.segments) for (const p of s) grow(p.x, p.y);
    for (const f of n.flags ?? []) grow(f.at.x + f.dir.x * (f.text.length * 3.6 + 14), f.at.y);
    if (n.kind !== 'wire') for (const p of n.pins) grow(p.x, p.y + 30);
  }
  const sheet = Number.isFinite(x0) ? { x: snap(x0 - 50), y: snap(y0 - 50), w: snap(x1 - x0 + 100), h: snap(y1 - y0 + 150) } : { x: 0, y: 0, w: 400, h: 300 };
  return { parts, nets, pinPos, sheet };
}

interface Box {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Columnas por flujo de señal. Cada pieza va una columna a la derecha de las que la gobiernan;
 * las resistencias y condensadores que solo cuelgan de un riel (pull-up, temporización)
 * acompañan a su pieza, debajo y con el pin hacia el mismo lado.
 */
function autoPlacement(
  visible: PartData[],
  perNet: Map<number, string[]>,
  split: (k: string) => { part: string; pin: string },
  railNet: (n: number | undefined) => boolean,
  netlist: Netlist,
  box: (p: PartData) => { x: number; y: number; w: number; h: number },
  symPins: (p: PartData) => { id: string; x: number; y: number }[],
  rot: Map<string, Rotation>,
  byId: Map<string, PartData>,
): Map<string, Vec> {
  const out = new Map<string, Vec>();
  if (!visible.length) return out;
  const netOf = (p: PartData, pin: string) => netlist.netOf.get(pinKey(p.id, pin));
  const signalNets = [...perNet.keys()].filter((n) => !railNet(n));
  const members = new Map<number, { part: string; pin: string }[]>(signalNets.map((n) => [n, perNet.get(n)!.map(split)]));

  // Satélites: pasivos de dos patillas con una a un riel, o que solo tocan una pieza.
  const host = new Map<string, { host: string; pin: string; hostPin: string }>();
  for (const p of visible) {
    if (kindOf(p.type) !== 'pass') continue;
    const pins = PARTS[p.type].pins(p.props).map((q) => q.id);
    const sig = pins.filter((q) => members.has(netOf(p, q) ?? -1));
    const others = new Map<string, string>();
    for (const q of sig) for (const m of members.get(netOf(p, q)!)!) if (m.part !== p.id && !others.has(m.part)) others.set(m.part, `${q}|${m.pin}`);
    const rail = pins.some((q) => railNet(netOf(p, q)));
    if ((rail && sig.length === 1) || (others.size === 1 && sig.length >= 1)) {
      const prefer = [...others.keys()].filter((id) => kindOf(byId.get(id)!.type) !== 'pass').sort((a, b) => order(byId.get(a)!) - order(byId.get(b)!))[0];
      if (!prefer) continue;
      const [pin, hostPin] = others.get(prefer)!.split('|');
      host.set(p.id, { host: prefer, pin, hostPin });
    }
  }
  const main = visible.filter((p) => !host.has(p.id));

  // Aristas de quien gobierna a quien: salida → entrada; un pasivo en serie, en medio.
  const succ = new Map<string, Set<string>>(main.map((p) => [p.id, new Set()]));
  const isMain = (id: string) => succ.has(id);
  for (const n of signalNets) {
    const ms = members.get(n)!.filter((m) => isMain(m.part));
    const drivers = new Set<string>();
    const loads = new Set<string>();
    for (const m of ms) {
      const p = byId.get(m.part)!;
      const role = roleOf(p, m.pin);
      const kind = kindOf(p.type);
      if (role === 'out' || (kind === 'source' && role !== 'in')) drivers.add(m.part);
      else if (role === 'in' || kind === 'sink') loads.add(m.part);
    }
    for (const m of ms) {
      const p = byId.get(m.part)!;
      const role = roleOf(p, m.pin);
      if (drivers.has(m.part) || loads.has(m.part)) continue;
      if (role === 'bidir' || kindOf(p.type) === 'pass') (drivers.size ? loads : drivers).add(m.part);
    }
    for (const d of drivers) for (const l of loads) if (d !== l) succ.get(d)!.add(l);
  }

  // Ciclos (realimentación): se rompen en una búsqueda en profundidad que empieza por las
  // fuentes; las aristas de vuelta no cuentan para las columnas.
  const indeg = new Map<string, number>(main.map((p) => [p.id, 0]));
  for (const s of succ.values()) for (const t of s) indeg.set(t, indeg.get(t)! + 1);
  const roots = [...main].sort((a, b) => order(a) - order(b) || indeg.get(a.id)! - indeg.get(b.id)! || a.y - b.y || a.x - b.x);
  const state = new Map<string, number>();
  const forward = new Map<string, string[]>(main.map((p) => [p.id, []]));
  const seen: string[] = [];
  const visit = (id: string) => {
    state.set(id, 1);
    seen.push(id);
    for (const t of [...succ.get(id)!].sort((a, b) => byId.get(a)!.y - byId.get(b)!.y || byId.get(a)!.x - byId.get(b)!.x)) {
      if (state.get(t) === 1) continue; // vuelta atrás
      forward.get(id)!.push(t);
      if (!state.has(t)) visit(t);
    }
    state.set(id, 2);
  };
  for (const r of roots) if (!state.has(r.id) && (indeg.get(r.id) === 0 || order(r) <= 1)) visit(r.id);
  for (const r of roots) if (!state.has(r.id)) visit(r.id);

  // Columna = camino más largo desde una fuente.
  const layer = new Map<string, number>(main.map((p) => [p.id, 0]));
  const topo: string[] = [];
  const mark = new Set<string>();
  const dfs = (id: string) => {
    if (mark.has(id)) return;
    mark.add(id);
    for (const t of forward.get(id)!) dfs(t);
    topo.push(id);
  };
  for (const id of seen) dfs(id);
  topo.reverse();
  for (const id of topo) for (const t of forward.get(id)!) layer.set(t, Math.max(layer.get(t)!, layer.get(id)! + 1));
  const nLayers = Math.max(...layer.values()) + 1;
  const cols: string[][] = Array.from({ length: nLayers }, () => []);
  for (const id of seen) cols[layer.get(id)!].push(id);

  // Orden dentro de cada columna: baricentro de los vecinos de la columna anterior y siguiente.
  const pred = new Map<string, string[]>(main.map((p) => [p.id, []]));
  for (const [s, ts] of forward) for (const t of ts) pred.get(t)!.push(s);
  const index = new Map<string, number>();
  const reindex = () => cols.forEach((c) => c.forEach((id, i) => index.set(id, i)));
  reindex();
  const bary = (ids: string[]) => (ids.length ? ids.reduce((a, id) => a + index.get(id)!, 0) / ids.length : null);
  for (let pass = 0; pass < 6; pass++) {
    const range = pass % 2 === 0 ? [...cols.keys()] : [...cols.keys()].reverse();
    for (const c of range) {
      const keyed = cols[c].map((id, i) => ({ id, k: bary(pass % 2 === 0 ? pred.get(id)! : forward.get(id)!) ?? i }));
      keyed.sort((a, b) => a.k - b.k);
      cols[c] = keyed.map((e) => e.id);
      reindex();
    }
  }

  // Un pasivo en serie se gira para que su patilla de entrada mire a quien lo gobierna.
  for (const id of seen) {
    const p = byId.get(id)!;
    if (kindOf(p.type) !== 'pass' || p.srot !== undefined) continue;
    const b = box(p);
    const fromLeft = symPins(p).find((q) => {
      const n = netOf(p, q.id);
      return n !== undefined && members.get(n)?.some((m) => m.part !== id && pred.get(id)!.includes(host.get(m.part)?.host ?? m.part));
    });
    if (fromLeft && fromLeft.x > b.x + b.w / 2) rot.set(id, 180);
  }

  // Geometría: anchura de columna + canal según cuántas redes lo cruzan.
  const stackOf = (id: string) => [id, ...[...host.entries()].filter(([, h]) => h.host === id).map(([s]) => s)];
  const sizeOf = (id: string) => box(byId.get(id)!);
  const colWidth = cols.map((c) => Math.max(40, ...c.flatMap((id) => stackOf(id).map((s) => sizeOf(s).w))));
  const crossing = cols.map((_, c) =>
    c === 0
      ? 0
      : signalNets.filter((n) => {
          const ls = new Set(members.get(n)!.map((m) => layer.get(host.get(m.part)?.host ?? m.part) ?? -1));
          return ls.has(c - 1) && ls.has(c);
        }).length,
  );
  const xs: number[] = [];
  let x = 0;
  cols.forEach((_, c) => {
    if (c > 0) x += colWidth[c - 1] + Math.max(90, 40 + crossing[c] * TRACK);
    xs.push(x);
  });

  // Verticalmente: cada columna apilada en su orden y centrada en la misma línea media, para
  // que la hoja quede compacta y equilibrada (sin escalones que dejan huecos).
  const top = new Map<string, number>();
  const stackHeight = (id: string) => stackOf(id).reduce((a, s) => a + sizeOf(s).h, 0) + (stackOf(id).length - 1) * 14;
  const colHeight = cols.map((c) => c.reduce((a, id) => a + stackHeight(id), 0) + Math.max(0, c.length - 1) * 36);
  const tallest = Math.max(...colHeight);
  cols.forEach((c, i) => {
    let cursor = snap((tallest - colHeight[i]) / 2);
    for (const id of c) {
      top.set(id, cursor);
      cursor += stackHeight(id) + 36;
    }
  });

  for (const [c, ids] of cols.entries()) {
    for (const id of ids) {
      let y = top.get(id)!;
      const hostPart = byId.get(id)!;
      const hb = sizeOf(id);
      // Girado 180°, su caja va de -(x + w) a -x: se compensa para que ocupe el mismo hueco.
      const turned = rot.get(id) === 180;
      out.set(id, turned ? { x: snap(xs[c] + hb.x + hb.w), y: snap(y + hb.y + hb.h) } : { x: snap(xs[c] - hb.x), y: snap(y - hb.y) });
      y += hb.h + 14;
      for (const s of stackOf(id).slice(1)) {
        const sp = byId.get(s)!;
        const h = host.get(s)!;
        // El pin del satélite mira al mismo lado que el pin de su pieza y queda alineado con él.
        const hp = symPins(hostPart).find((q) => q.id === h.hostPin);
        const hostRight = hp ? hp.x > hb.x + hb.w / 2 : true;
        const sb = sizeOf(s);
        const mine = symPins(sp).find((q) => q.id === h.pin);
        const mineRight = mine ? mine.x > sb.x + sb.w / 2 : true;
        if (mineRight !== hostRight && sp.srot === undefined) rot.set(s, 180);
        const flipped = rot.get(s) === 180;
        const by = flipped ? -(sb.y + sb.h) : sb.y;
        const bx = flipped ? -(sb.x + sb.w) : sb.x;
        const pinX = mine ? (flipped ? -mine.x : mine.x) : 0;
        const sx = hp ? xs[c] - hb.x + hp.x - pinX : xs[c] - bx;
        out.set(s, { x: snap(sx), y: snap(y - by) });
        y += sb.h + 14;
      }
    }
  }
  return out;
}

/** Quién va primero en su columna: placas, fuentes, lógica, pasivos y salidas. */
function order(p: PartData) {
  if (PARTS[p.type].mcu) return 0;
  const k = kindOf(p.type);
  return k === 'source' ? 1 : k === 'logic' ? 2 : k === 'pass' ? 3 : 4;
}

/** Agrupa los símbolos en columnas: los que se solapan en horizontal van juntos. */
function clusterColumns(boxes: Box[]) {
  const sorted = [...boxes].sort((a, b) => a.x0 - b.x0);
  const cols: { ids: string[]; x0: number; x1: number }[] = [];
  for (const b of sorted) {
    const last = cols[cols.length - 1];
    if (last && b.x0 < last.x1 - 4) {
      last.ids.push(b.id);
      last.x1 = Math.max(last.x1, b.x1);
    } else cols.push({ ids: [b.id], x0: b.x0, x1: b.x1 });
  }
  return cols;
}

/**
 * Une una red por un canal: un tronco vertical en su carril y un tramo horizontal desde cada
 * pin. Solo si todos los pines miran al mismo canal y hay carril libre; si no, etiquetas.
 */
function routeInChannel(want: number[], tips: Vec[], channels: { x0: number; x1: number; used: [number, number][][] }[], blockers: Box[]) {
  const k = want[0];
  if (k < 0 || want.some((w) => w !== k) || !channels[k]) return null;
  const ch = channels[k];
  const ys = tips.map((t) => t.y);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  if (y1 - y0 > MAX_TRUNK) return null;
  // Un tramo horizontal o el tronco no deben pasar por detrás de una etiqueta.
  const hits = (x: number) =>
    blockers.some((b) => (x >= b.x0 && x <= b.x1 && y1 >= b.y0 && y0 <= b.y1) || tips.some((t) => t.y >= b.y0 && t.y <= b.y1 && Math.max(t.x, x) >= b.x0 && Math.min(t.x, x) <= b.x1));
  const tracks = Math.floor((ch.x1 - ch.x0 - 2 * 14) / TRACK) + 1;
  const center = (ch.x0 + ch.x1) / 2;
  // Carriles desde el centro del canal hacia fuera: los troncos quedan agrupados y simétricos.
  const orderTracks = Array.from({ length: Math.max(0, tracks) }, (_, i) => (i % 2 === 0 ? i / 2 : -(i + 1) / 2));
  for (const t of orderTracks) {
    const x = snap(center + t * TRACK, 2);
    if (x <= ch.x0 + 10 || x >= ch.x1 - 10 || hits(x)) continue;
    const slot = Math.round((x - ch.x0) / 2);
    ch.used[slot] ??= [];
    if (ch.used[slot].some(([a, b]) => !(y1 + 4 < a || y0 - 4 > b))) continue;
    ch.used[slot].push([y0, y1]);
    const segments: Vec[][] = tips.map((tip) => [tip, { x, y: tip.y }]);
    const dots: Vec[] = [];
    if (y1 > y0) {
      segments.push([{ x, y: y0 }, { x, y: y1 }]);
      for (const y of ys) if (y > y0 && y < y1) dots.push({ x, y });
      // Dos pines a la misma altura en un extremo del tronco: también es una unión.
      for (const y of [y0, y1]) if (ys.filter((v) => v === y).length > 1) dots.push({ x, y });
    }
    return { segments, dots };
  }
  return null;
}

/**
 * Dónde va cada símbolo: donde lo dejó alguien (sx, sy) o la colocación automática que se
 * calculó al dibujar el esquema por última vez.
 */
export function schematicPlacement(all: PartData[]): Map<string, Vec> {
  const out = new Map<string, Vec>();
  for (const p of all) {
    if (!PARTS[p.type] || PARTS[p.type].category === 'Protoboards') continue;
    if (p.sx !== undefined && p.sy !== undefined) out.set(p.id, { x: p.sx, y: p.sy });
    else out.set(p.id, lastAuto.get(p.id) ?? { x: p.x, y: p.y });
  }
  return out;
}

/** Movimientos en el esquema + la posición actual de los símbolos que aún no tenían una fija,
 *  para que mover uno no recoloque al resto. */
export function withFrozenPlacement(all: PartData[], moves: { id: string; x: number; y: number }[]) {
  const place = schematicPlacement(all);
  const moved = new Set(moves.map((m) => m.id));
  const frozen = all.filter((p) => !moved.has(p.id) && place.has(p.id) && (p.sx === undefined || p.sy === undefined)).map((p) => ({ id: p.id, ...place.get(p.id)! }));
  return [...moves, ...frozen];
}
