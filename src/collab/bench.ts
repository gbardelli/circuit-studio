// Banco de montaje para plantillas grandes sobre protoboards de 830 puntos apiladas en vertical.
// Clava cada pieza en sus agujeros y tiende los cables como se haría a mano:
// · Alimentación: un puente vertical corto hasta el riel de la misma mitad.
// · Señales en la misma mitad de una placa: por el pasillo entre el riel y la fila a (o j).
// · Hacia otra placa: cada mitad sale por su pasillo exterior; entre placas contiguas el cable
//   corre por el pasillo que comparten y, si no son contiguas, baja por el canal lateral derecho.
// · Hacia el GIGA (a la izquierda): por el canal lateral izquierdo.
// Dos cables nunca comparten un tramo de carril: se pueden seguir con el dedo.
import { toWorld, type Props, type Rotation, type Vec } from '../core/types';
import { PARTS } from '../parts';
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
  segment: '#c08457', // segmentos del display
  uart: '#5ab0ff', // UART de la pantalla
  monitor: '#8a96a3', // líneas que solo lee el GIGA
};

interface Hole {
  board: string;
  row: string;
  col: number;
}

interface Band {
  lanes: number[];
  used: [number, number][][];
}

interface Socket {
  ref: Ref;
  half: 'top' | 'bottom';
  board: string;
}

export class Bench {
  readonly parts: TemplatePart[] = [];
  readonly wires: TemplateWire[] = [];
  private boards = new Map<string, Vec>();
  private holes = new Map<string, Hole>();
  private used = new Set<string>();
  private bands = new Map<string, Band>();
  private order: string[] = [];
  private risers = new Map<'left' | 'right', [number, number][][]>();
  private crossings = new Map<string, number>();

  board(key: string, x: number, y: number, label?: string) {
    this.parts.push({ key, type: 'breadboard-full', x, y, props: label ? { label } : {} });
    this.boards.set(key, { x, y });
    this.band(`${key}:top`, steps(y + 36, y + 56));
    this.band(`${key}:bottom`, steps(y + 176, y + 196));
  }

  private band(name: string, lanes: number[]) {
    this.bands.set(name, { lanes, used: lanes.map(() => []) });
  }

  loose(key: string, type: string, x: number, y: number, props: Props = {}, rot: Rotation = 0) {
    this.parts.push({ key, type, x, y, props, rot });
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

  // ── Pasillos y canales ────────────────────────────────────────────────────
  private ensureBands() {
    if (this.order.length) return;
    this.order = [...this.boards.entries()].sort((p, q) => p[1].y - q[1].y).map(([k]) => k);
    this.order.forEach((k, i) => {
      const y = this.boards.get(k)!.y;
      if (i === 0) this.band('out:0:above', steps(y - 12, y - 64));
      const next = this.order[i + 1];
      if (next) {
        const lanes = steps(y + BOARD_H + 6, this.boards.get(next)!.y - 6);
        const shared: Band = { lanes, used: lanes.map(() => []) };
        this.bands.set(`out:${i}:below`, shared);
        this.bands.set(`out:${i + 1}:above`, shared);
      } else this.band(`out:${i}:below`, steps(y + BOARD_H + 6, y + BOARD_H + 64));
    });
    for (const side of ['left', 'right'] as const) this.risers.set(side, Array.from({ length: 28 }, () => []));
  }

  /** Carril en la mitad de una placa: el pasillo interior o, si está lleno, el exterior. */
  private halfLane(board: string, half: 'top' | 'bottom', x1: number, x2: number) {
    return this.tryLane(`${board}:${half}`, x1, x2) ?? this.lane(`out:${this.order.indexOf(board)}:${half === 'top' ? 'above' : 'below'}`, x1, x2);
  }

  private tryLane(band: string, x1: number, x2: number) {
    try {
      return this.lane(band, x1, x2);
    } catch {
      return null;
    }
  }

  /** Reserva un carril libre en el tramo [x1, x2] de una banda. */
  private lane(band: string, x1: number, x2: number) {
    const b = this.bands.get(band)!;
    const lo = Math.min(x1, x2) - 4;
    const hi = Math.max(x1, x2) + 4;
    for (let i = 0; i < b.lanes.length; i++) {
      if (b.used[i].every(([a, c]) => hi < a || lo > c)) {
        b.used[i].push([lo, hi]);
        return b.lanes[i];
      }
    }
    throw new Error(`Plantilla: el pasillo ${band} está lleno entre x=${x1} y x=${x2}`);
  }

  private riser(side: 'left' | 'right', y1: number, y2: number) {
    const lo = Math.min(y1, y2) - 4;
    const hi = Math.max(y1, y2) + 4;
    const slots = this.risers.get(side)!;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].every(([a, b]) => hi < a || lo > b)) {
        slots[i].push([lo, hi]);
        return side === 'right' ? BOARD_W + 14 + i * 5 : -14 - i * 5;
      }
    }
    throw new Error('Plantilla: no quedan canales laterales');
  }

  /** Columna sin integrados para cruzar el canal central, lo más cerca de x. */
  private gapColumn(board: string, x: number) {
    const b = this.boards.get(board)!;
    const want = Math.round((x - b.x - COL0) / 10) + 1;
    for (let d = 0; d < COLS; d++) {
      for (const c of d === 0 ? [want] : [want + d, want - d]) {
        if (c >= 5 && c <= COLS && !this.used.has(`${board}:e${c}`) && !this.used.has(`${board}:f${c}`)) {
          const n = this.crossings.get(`${board}:${c}`) ?? 0;
          this.crossings.set(`${board}:${c}`, n + 1);
          return b.x + colX(c) + [0, -3, 3, -6, 6][n % 5];
        }
      }
    }
    throw new Error(`Plantilla: no hay columna libre para cruzar ${board}`);
  }

  /** Tramo desde un agujero hasta el borde de su pasillo exterior en la dirección `dir`. */
  private exit(s: Socket, dir: 'up' | 'down', towardX: number) {
    const k = this.order.indexOf(s.board);
    const p = this.at(s.ref);
    const band = `out:${k}:${dir === 'up' ? 'above' : 'below'}`;
    if ((s.half === 'top') === (dir === 'up')) return { pts: [] as Vec[], x: p.x, band };
    const gx = this.gapColumn(s.board, (p.x + towardX) / 2);
    const yi = this.halfLane(s.board, s.half, p.x, gx);
    return { pts: [{ x: p.x, y: yi }, { x: gx, y: yi }], x: gx, band };
  }

  /** Cable entre dos puntos, tendido por pasillos. `direct` lo deja recto (piezas sueltas vecinas). */
  wire(a: Ref, b: Ref, color: string, direct = false) {
    this.ensureBands();
    const sa = this.socket(a);
    const sb = this.socket(b);
    const ea = sa?.ref ?? a;
    const eb = sb?.ref ?? b;
    if (direct) return void this.wires.push({ a: ea, b: eb, color });
    const pa = this.at(ea);
    const pb = this.at(eb);
    let pts: Vec[] = [];
    if (sa && sb && sa.board === sb.board) {
      if (sa.half === sb.half) {
        const y = this.halfLane(sa.board, sa.half, pa.x, pb.x);
        pts = [{ x: pa.x, y }, { x: pb.x, y }];
      } else {
        const gx = this.gapColumn(sa.board, (pa.x + pb.x) / 2);
        const ya = this.halfLane(sa.board, sa.half, pa.x, gx);
        const yb = this.halfLane(sb.board, sb.half, gx, pb.x);
        pts = [{ x: pa.x, y: ya }, { x: gx, y: ya }, { x: gx, y: yb }, { x: pb.x, y: yb }];
      }
    } else if (sa && sb) {
      const down = this.order.indexOf(sa.board) < this.order.indexOf(sb.board);
      const xa = this.exit(sa, down ? 'down' : 'up', pb.x);
      const xb = this.exit(sb, down ? 'up' : 'down', pa.x);
      if (this.bands.get(xa.band) === this.bands.get(xb.band)) {
        const y = this.lane(xa.band, xa.x, xb.x);
        pts = [...xa.pts, { x: xa.x, y }, { x: xb.x, y }, ...xb.pts.slice().reverse()];
      } else {
        const rx = this.riser('right', this.bands.get(xa.band)!.lanes[0], this.bands.get(xb.band)!.lanes[0]);
        const ya = this.lane(xa.band, xa.x, rx);
        const yb = this.lane(xb.band, xb.x, rx);
        pts = [...xa.pts, { x: xa.x, y: ya }, { x: rx, y: ya }, { x: rx, y: yb }, { x: xb.x, y: yb }, ...xb.pts.slice().reverse()];
      }
    } else if (sa || sb) {
      // Una punta en una placa y la otra en el GIGA, a la izquierda: canal izquierdo.
      const s = (sa ?? sb)!;
      const free = sa ? pb : pa;
      const xo = this.exit(s, s.half === 'top' ? 'up' : 'down', -100);
      const rx = this.riser('left', free.y, this.bands.get(xo.band)!.lanes[0]);
      const y = this.lane(xo.band, rx, xo.x);
      const fromBoard = [...xo.pts, { x: xo.x, y }, { x: rx, y }, { x: rx, y: free.y }];
      pts = sa ? fromBoard : fromBoard.slice().reverse();
    }
    this.wires.push({ a: ea, b: eb, color, points: pts.length ? pts : undefined });
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
    const hole = this.railHole(s.board, `${s.half === 'top' ? 't' : 'b'}${plus ? 'p' : 'n'}` as 'tp', col);
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
  chainRails(boards: string[]) {
    boards.forEach((k, i) => {
      this.wires.push({ a: this.railHole(k, 'tp', 1), b: this.railHole(k, 'bp', 1), color: WIRE.v33 });
      this.wires.push({ a: this.railHole(k, 'tn', 2), b: this.railHole(k, 'bn', 2), color: WIRE.gnd });
      const next = boards[i + 1];
      if (!next) return;
      this.wires.push({ a: this.railHole(k, 'bp', 3), b: this.railHole(next, 'tp', 3), color: WIRE.v33 });
      this.wires.push({ a: this.railHole(k, 'bn', 4), b: this.railHole(next, 'tn', 4), color: WIRE.gnd });
    });
  }

  template(meta: Omit<Template, 'parts' | 'wires'>): Template {
    return { ...meta, parts: this.parts, wires: this.wires };
  }
}

function steps(from: number, to: number) {
  const out: number[] = [];
  const d = from < to ? 4 : -4;
  for (let y = from; d > 0 ? y <= to : y >= to; y += d) out.push(y);
  return out;
}
