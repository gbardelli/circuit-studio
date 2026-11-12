// Mount components on real breadboard holes, then connect their networks with short jumpers.
// Physical routing runs after placement, so displays and chip bodies remain clear.
import { toWorld, type Props, type Rotation, type Vec } from '../core/types';
import { PARTS } from '../parts';
import { colorNamedNetworks, routePhysicalWiring, shortenPhysicalWiring, type RouteOptions } from './physicalWiring';
import type { Template, TemplatePart, TemplateWire } from './templates';

export type Ref = [string, string];

const ROW_Y: Record<string, number> = { a: 60, b: 70, c: 80, d: 90, e: 100, f: 130, g: 140, h: 150, i: 160, j: 170 };
const RAIL_Y: Record<string, number> = { tp: 20, tn: 30, bp: 200, bn: 210 };
const TOP = ['a', 'b', 'c', 'd', 'e'];
const BOTTOM = ['j', 'i', 'h', 'g', 'f'];
const COL0 = 30;
const COLS = 63;
export const BOARD_W = COL0 * 2 + (COLS - 1) * 10;
export const BOARD_H = 230;
const colX = (c: number) => COL0 + (c - 1) * 10;
const railHole = (c: number) => c >= 1 && c <= COLS && (c - 1) % 6 !== 5;

/** Código de colores del montaje: cada función tiene el suyo, en la simulación y en la placa real. */
export const WIRE = {
  v33: '#e5484d', // +3,3 V
  v5: '#f2862e', // +5 V (solo la pantalla)
  gnd: '#26272b',
  cabin: '#3e7bfa', // pulsadores de cabina (PP)
  call: '#f5c518', // llamadas de piso (innovación)
  sensor: '#2fbf71', // sensores de planta (SP)
  dest: '#f4f4f2', // bus del destino
  current: '#9b6bf2', // bus del piso actual
  control: '#ff6b8a', // control: aceptar, ocupado, llegada
  clock: '#45d0c0', // reloj
  reset: '#b48cff', // reinicio
  encoder: '#8b5a2b', // interior del codificador de sensores y su retardo
  segment: '#c08457', // segmentos del display
  uart: '#5ab0ff', // UART de la pantalla
  monitor: '#8a96a3', // líneas que solo lee el GIGA
};
export const SEGMENT_COLORS: Record<string, string> = {
  a: '#db873e', b: '#d0ad48', c: '#78a85b', d: '#43a99d',
  e: '#619bd1', f: '#a488cb', g: '#d77da0',
};

interface Hole {
  board: string;
  row: string;
  col: number;
}
interface Socket {
  ref: Ref;
  half: 'top' | 'bottom';
  board: string;
}

export class Bench {
  auxiliaryBottomRail?: string;
  readonly parts: TemplatePart[] = [];
  readonly wires: TemplateWire[] = [];
  private boards = new Map<string, Vec>();
  private holes = new Map<string, Hole>();
  private used = new Set<string>();

  board(key: string, x: number, y: number, label?: string) {
    this.parts.push({ key, type: 'breadboard-full', x, y, props: label ? { label } : {} });
    this.boards.set(key, { x, y });
  }

  loose(key: string, type: string, x: number, y: number, props: Props = {}, rot: Rotation = 0) {
    this.parts.push({ key, type, x, y, props, rot });
  }

  /**
   * Clava un módulo de alimentación (MB102) en los rieles de `col`: sus cuatro patillas ocupan
   * tp, tn, bp y bn de esa columna. Devuelve la pieza para que se pueda ajustar.
   */
  plugPower(key: string, board: string, col: number, props: Props = {}) {
    const b = this.boards.get(board)!;
    if (!railHole(col)) throw new Error(`Plantilla: la columna ${col} no tiene agujero de riel`);
    for (const rail of ['tp', 'tn', 'bp', 'bn']) this.claim(board, `${rail}${col}`);
    this.parts.push({ key, type: 'mb102-power', x: b.x + colX(col), y: b.y + RAIL_Y.tp, props, rot: 0 });
  }

  /** Clava una pieza con su patilla de origen en (col, row). */
  put(key: string, type: string, board: string, col: number, row: string, props: Props = {}, rot: Rotation = 0) {
    const b = this.boards.get(board)!;
    this.mount(key, type, board, b.x + colX(col), b.y + ROW_Y[row], props, rot);
  }

  /**
   * Circuito integrado a caballo del canal, con la patilla 1 en la columna `col`.
   * `flip` lo gira 180° (muesca a la derecha): sus patillas de arriba pasan abajo.
   */
  dip(key: string, type: string, board: string, col: number, label: string, flip = false) {
    const n = PARTS[type].pins(PARTS[type].defaults).length / 2;
    if (flip) this.put(key, type, board, col + n - 1, 'f', { label }, 180);
    else this.put(key, type, board, col, 'e', { label });
  }

  /** Resistencia vertical desde un riel hasta la fila más cercana (pull-up o pull-down). */
  fromRail(key: string, board: string, col: number, rail: 'tp' | 'tn' | 'bp' | 'bn', ohms: number) {
    const b = this.boards.get(board)!;
    const top = rail.startsWith('t');
    // Los rieles no tienen agujero cada sexta columna (6, 12, 18…).
    if ((col - 1) % 6 === 5) throw new Error(`Plantilla: la columna ${col} no tiene agujero de riel`);
    this.claim(board, `${rail}${col}`);
    this.mount(key, 'resistor', board, b.x + colX(col), b.y + RAIL_Y[rail], { resistance: ohms }, top ? 90 : 270, true);
  }

  private claim(board: string, hole: string) {
    const id = `${board}:${hole}`;
    if (this.used.has(id)) throw new Error(`Plantilla: agujero ${hole} de ${board} ocupado`);
    this.used.add(id);
  }

  private mount(key: string, type: string, board: string, x: number, y: number, props: Props, rot: Rotation, railStart = false) {
    this.parts.push({ key, type, x, y, props, rot });
    const b = this.boards.get(board)!;
    const def = PARTS[type];
    def.pins({ ...def.defaults, ...props }).forEach((pin, i) => {
      if (railStart && i === 0) return; // la patilla del riel ya está reservada
      const at = toWorld({ x, y, rot }, pin);
      const col = (at.x - b.x - COL0) / 10 + 1;
      const row = Object.keys(ROW_Y).find((r) => b.y + ROW_Y[r] === at.y);
      if (!Number.isInteger(col) || col < 1 || col > COLS || !row) throw new Error(`Plantilla: ${key}.${pin.id} no cae en un agujero`);
      this.claim(board, `${row}${col}`);
      this.holes.set(`${key}.${pin.id}`, { board, row, col });
    });
    // Una resistencia tumbada tapa los agujeros entre sus patillas.
    if (type === 'resistor' && (rot === 0 || rot === 180)) {
      const p1 = this.holes.get(`${key}.1`)!;
      const p2 = this.holes.get(`${key}.2`)!;
      for (let c = Math.min(p1.col, p2.col) + 1; c < Math.max(p1.col, p2.col); c++) this.used.add(`${board}:${p1.row}${c}`);
    }
  }

  /** Agujero libre en la columna de la patilla, lo más lejos posible del canal central. */
  private socket(ref: Ref): Socket | null {
    const h = this.holes.get(`${ref[0]}.${ref[1]}`);
    if (!h) {
      if (!this.boards.has(ref[0])) return null;
      const row = ref[1].replace(/\d+$/, '');
      return { ref, half: TOP.includes(row) || row.startsWith('t') ? 'top' : 'bottom', board: ref[0] };
    }
    const top = TOP.includes(h.row);
    const free = (top ? TOP : BOTTOM).find((r) => !this.used.has(`${h.board}:${r}${h.col}`));
    if (!free) throw new Error(`Plantilla: la columna ${h.col} de ${h.board} está llena (${ref.join('.')})`);
    this.used.add(`${h.board}:${free}${h.col}`);
    return { ref: [h.board, `${free}${h.col}`], half: top ? 'top' : 'bottom', board: h.board };
  }

  at(ref: Ref): Vec {
    const b = this.boards.get(ref[0]);
    if (b) {
      const m = /^(tp|tn|bp|bn|[a-j])(\d+)$/.exec(ref[1])!;
      return { x: b.x + colX(Number(m[2])), y: b.y + (RAIL_Y[m[1]] ?? ROW_Y[m[1]]) };
    }
    const p = this.parts.find((q) => q.key === ref[0])!;
    const def = PARTS[p.type];
    const pin = def.pins({ ...def.defaults, ...p.props }).find((q) => q.id === ref[1]);
    if (!pin) throw new Error(`Plantilla: ${ref.join('.')} no existe`);
    return toWorld({ x: p.x, y: p.y, rot: p.rot ?? 0 }, pin);
  }

  /** Reserve distinct physical holes; the final pass lays out the complete network. */
  wire(a: Ref, b: Ref, color: string, _direct = false) {
    const sa = this.socket(a), sb = this.socket(b);
    this.wires.push({ a: sa?.ref ?? a, b: sb?.ref ?? b, color });
  }

  /** Cable con un recorrido dado a mano (entre piezas sueltas). */
  route(a: Ref, b: Ref, color: string, path: (pa: Vec, pb: Vec) => Vec[]) {
    this.wires.push({ a, b, color, points: path(this.at(a), this.at(b)) });
  }

  // ── Alimentación ──────────────────────────────────────────────────────────
  /** Puente vertical hasta el riel de la misma mitad, en la columna libre más cercana. */
  rail(ref: Ref, plus: boolean, color?: string) {
    const s = this.socket(ref)!;
    const col = Number(s.ref[1].replace(/^[a-z]+/, ''));
    const half = plus && s.board === this.auxiliaryBottomRail ? 't' : s.half === 'top' ? 't' : 'b';
    const hole = this.railHole(s.board, `${half}${plus ? 'p' : 'n'}` as 'tp', col);
    this.wires.push({ a: s.ref, b: hole, color: color ?? (plus ? WIRE.v33 : WIRE.gnd) });
  }

  /** Agujero libre de un riel cerca de una columna. */
  railHole(board: string, kind: 'tp' | 'tn' | 'bp' | 'bn', col: number): Ref {
    for (let d = 0; d < COLS; d++) {
      for (const c of d === 0 ? [col] : [col + d, col - d]) {
        if (railHole(c) && !this.used.has(`${board}:${kind}${c}`)) {
          this.used.add(`${board}:${kind}${c}`);
          return [board, `${kind}${c}`];
        }
      }
    }
    throw new Error(`Plantilla: riel ${kind} de ${board} lleno`);
  }

  /**
   * Rieles de todas las placas, encadenados por la izquierda: arriba con abajo en cada placa
   * y el riel de abajo de una con el de arriba de la siguiente. `skip` deja sin +3,3 V una placa.
   */
  chainRails(boards: string[], positiveColor = WIRE.v33) {
    boards.forEach((k, i) => {
      if(k !== this.auxiliaryBottomRail) this.wires.push({ a: this.railHole(k, 'tp', 1), b: this.railHole(k, 'bp', 1), color: positiveColor });
      this.wires.push({ a: this.railHole(k, 'tn', 2), b: this.railHole(k, 'bn', 2), color: WIRE.gnd });
      const next = boards[i + 1];
      if (!next) return;
      this.wires.push({ a: this.railHole(k, k === this.auxiliaryBottomRail ? 'tp' : 'bp', 3), b: this.railHole(next, 'tp', 3), color: positiveColor });
      this.wires.push({ a: this.railHole(k, 'bn', 4), b: this.railHole(next, 'tn', 4), color: WIRE.gnd });
    });
  }

  /** Condensador sin polaridad entre rieles adyacentes, sin compartir un agujero ocupado. */
  bypass(key: string, board: string, near: number) {
    const b = this.boards.get(board)!;
    for (let d = 0; d < COLS; d++) for (const col of d ? [near + d, near - d] : [near]) {
      if (!railHole(col) || this.used.has(`${board}:tp${col}`) || this.used.has(`${board}:tn${col}`)) continue;
      this.claim(board, `tp${col}`);
      this.claim(board, `tn${col}`);
      this.loose(key, 'capacitor-ceramic', b.x + colX(col), b.y + RAIL_Y.tp, { capacitance: 100e-9, voltage: 50, label: `${key.toUpperCase()} · desacoplo de 100 nF` }, 90);
      return;
    }
    throw new Error(`Plantilla: no hay espacio para desacoplo en ${board}`);
  }

  template(meta: Omit<Template, 'parts' | 'wires'>, palette: Readonly<Record<string, string>> = {}, route: RouteOptions = {}): Template {
    const scene = {
      parts: this.parts.map(p => ({ id: p.key, type: p.type, x: p.x, y: p.y, rot: p.rot ?? 0, props: { ...PARTS[p.type].defaults, ...p.props } })),
      wires: this.wires.map((w, i) => ({ id: `w${i}`, color: w.color, points: w.points ?? [], a: { part: w.a[0], pin: w.a[1], ...this.at(w.a) }, b: { part: w.b[0], pin: w.b[1], ...this.at(w.b) } })),
    };
    const result = colorNamedNetworks(routePhysicalWiring(shortenPhysicalWiring(scene), route), palette);
    return { ...meta, parts: this.parts, wires: result.wires.map(w => ({ a: [w.a.part!, w.a.pin!], b: [w.b.part!, w.b.pin!], points: w.points, color: w.color })) };
  }
}
