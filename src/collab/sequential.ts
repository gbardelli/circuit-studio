// Plantillas de lógica secuencial montadas sobre varias protoboards encadenadas.
// A diferencia de las de `templates.ts`, aquí las posiciones no se escriben a mano: `Rig`
// clava cada pieza en sus agujeros y los puentes salen de un agujero libre de la misma columna.
import type { Props, Vec } from '../core/types';
import { PARTS } from '../parts';
import type { Template, TemplatePart, TemplateWire } from './templates';

type Ref = [string, string];

const RED = '#e5484d';
const BLACK = '#26272b';
const BLUE = '#3e7bfa';
const ORANGE = '#f2862e';
const GREEN = '#2fbf71';
const YELLOW = '#f5c518';
const PURPLE = '#9b6bf2';
const SIGNALS = [BLUE, ORANGE, GREEN, YELLOW, PURPLE];

// Geometría de la protoboard de 400 puntos (ver `parts/breadboard.tsx`).
const COL0 = 30;
const ROW_Y: Record<string, number> = { a: 60, b: 70, c: 80, d: 90, e: 100, f: 130, g: 140, h: 150, i: 160, j: 170 };
const RAIL_Y: Record<string, number> = { tp: 20, tn: 30, bp: 200, bn: 210 };
const TOP_ROWS = ['a', 'b', 'c', 'd', 'e'];
const BOTTOM_ROWS = ['j', 'i', 'h', 'g', 'f']; // de fuera hacia dentro: los puentes quedan junto al riel
const COLS = 30;
const colX = (c: number) => COL0 + (c - 1) * 10;
const railHole = (c: number) => c >= 1 && c <= COLS && (c - 1) % 6 !== 5;

class Rig {
  readonly parts: TemplatePart[] = [];
  readonly wires: TemplateWire[] = [];
  private boards = new Map<string, Vec>();
  private holes = new Map<string, { board: string; row: string; col: number }>();
  private used = new Set<string>();
  private signal = 0;

  board(key: string, x: number, y: number) {
    this.parts.push({ key, type: 'breadboard-half', x, y, props: { cols: COLS } });
    this.boards.set(key, { x, y });
  }

  /** Clava una pieza con su primera patilla en (col, row); marca los agujeros que ocupa. */
  put(key: string, type: string, board: string, col: number, row: string, props: Props = {}) {
    const b = this.boards.get(board)!;
    const x = b.x + colX(col);
    const y = b.y + ROW_Y[row];
    this.parts.push({ key, type, x, y, props });
    const def = PARTS[type];
    for (const pin of def.pins({ ...def.defaults, ...props })) {
      const c = (x + pin.x - b.x - COL0) / 10 + 1;
      const r = Object.keys(ROW_Y).find((k) => b.y + ROW_Y[k] === y + pin.y);
      if (!Number.isInteger(c) || !r || c < 1 || c > COLS) throw new Error(`Plantilla: ${key}.${pin.id} no cae en un agujero`);
      this.holes.set(`${key}.${pin.id}`, { board, row: r, col: c });
      this.used.add(`${board}:${r}${c}`);
    }
    // Una resistencia tumbada tapa los agujeros entre sus patillas.
    if (type === 'resistor') for (let c = col + 1; c < col + 4; c++) this.used.add(`${board}:${row}${c}`);
  }

  /** Circuito integrado a caballo del canal central. */
  dip(key: string, type: string, board: string, col: number, props: Props = {}) {
    this.put(key, type, board, col, 'e', props);
  }

  /** Pieza suelta, fuera de las protoboards. */
  loose(key: string, type: string, x: number, y: number, props: Props = {}) {
    this.parts.push({ key, type, x, y, props });
  }

  private pos(board: string, hole: string): Vec {
    const m = /^(tp|tn|bp|bn|[a-j])(\d+)$/.exec(hole)!;
    const b = this.boards.get(board)!;
    return { x: b.x + colX(Number(m[2])), y: b.y + (RAIL_Y[m[1]] ?? ROW_Y[m[1]]) };
  }

  /** Un agujero libre en la columna de la patilla: ahí se sujeta el puente. */
  private end(ref: Ref): Ref {
    const at = this.holes.get(`${ref[0]}.${ref[1]}`);
    if (!at) return ref;
    const rows = TOP_ROWS.includes(at.row) ? TOP_ROWS : BOTTOM_ROWS;
    const free = rows.find((r) => !this.used.has(`${at.board}:${r}${at.col}`));
    if (!free) throw new Error(`Plantilla: la columna ${at.col} de ${at.board} está llena`);
    this.used.add(`${at.board}:${free}${at.col}`);
    return [at.board, `${free}${at.col}`];
  }

  /** Puente entre dos puntos. `lane`: cota y por la que discurre el tramo horizontal. */
  wire(a: Ref, b: Ref, color?: string, lane?: number) {
    const ea = this.end(a);
    const eb = this.end(b);
    const points = lane === undefined ? undefined : [{ x: this.at(ea).x, y: lane }, { x: this.at(eb).x, y: lane }];
    this.wires.push({ a: ea, b: eb, points, color: color ?? SIGNALS[this.signal++ % SIGNALS.length] });
  }

  private at(ref: Ref): Vec {
    return this.boards.has(ref[0]) ? this.pos(ref[0], ref[1]) : this.partPin(ref);
  }

  private partPin([key, pin]: Ref): Vec {
    const p = this.parts.find((q) => q.key === key)!;
    const def = PARTS[p.type];
    const d = def.pins({ ...def.defaults, ...p.props }).find((q) => q.id === pin)!;
    return { x: p.x + d.x, y: p.y + d.y };
  }

  /** Agujero libre de un riel lo más cerca posible de la columna `col`. */
  private rail(board: string, kind: string, col: number): Ref {
    for (let d = 0; d < COLS; d++) {
      for (const c of d === 0 ? [col] : [col + d, col - d]) {
        if (c >= 5 && railHole(c) && !this.used.has(`${board}:${kind}${c}`)) {
          this.used.add(`${board}:${kind}${c}`);
          return [board, `${kind}${c}`];
        }
      }
    }
    throw new Error(`Plantilla: el riel ${kind} de ${board} está lleno`);
  }

  private toRail(ref: Ref, plus: boolean) {
    const [board, hole] = this.end(ref);
    const top = TOP_ROWS.includes(hole[0]);
    const target = this.rail(board, `${top ? 't' : 'b'}${plus ? 'p' : 'n'}`, Number(hole.slice(1)));
    this.wires.push({ a: [board, hole], b: target, color: plus ? RED : BLACK });
  }

  vcc(ref: Ref) {
    this.toRail(ref, true);
  }

  gnd(ref: Ref) {
    this.toRail(ref, false);
  }

  /** Fuente de banco sobre la primera protoboard y alimentación encadenada a las demás. */
  power(supply: string, x: number, y: number, boards: string[], opts: { skipPlus?: string[] } = {}) {
    this.loose(supply, 'bench-supply', x, y, { voltage: 5, current: 1 });
    const first = this.boards.get(boards[0])!;
    // Los bornes de la fuente caen en x+40 (−) y x+120 (+): se bajan en vertical a un riel.
    this.hold(boards[0], 'tn', Math.round((x + 40 - first.x - COL0) / 10) + 1, [supply, '-'], BLACK);
    this.hold(boards[0], 'tp', Math.round((x + 120 - first.x - COL0) / 10) + 1, [supply, '+'], RED);
    boards.forEach((bk, i) => {
      const plus = !opts.skipPlus?.includes(bk);
      // Cada protoboard une su riel de arriba con el de abajo por la izquierda.
      if (plus) this.link([bk, 'tp3'], [bk, 'bp3'], RED);
      this.link([bk, 'tn4'], [bk, 'bn4'], BLACK);
      if (i === 0) return;
      const prev = boards[i - 1];
      if (plus) this.link([prev, 'tp28'], [bk, 'tp1'], RED);
      this.link([prev, 'tn28'], [bk, 'tn1'], BLACK);
    });
  }

  private hold(board: string, kind: string, col: number, from: Ref, color: string) {
    const to: Ref = [board, `${kind}${col}`];
    this.used.add(`${board}:${kind}${col}`);
    this.wires.push({ a: from, b: to, color });
  }

  private link(a: Ref, b: Ref, color: string) {
    this.used.add(`${a[0]}:${a[1]}`);
    this.used.add(`${b[0]}:${b[1]}`);
    this.wires.push({ a, b, color });
  }

  /** LED con su resistencia en serie, en la mitad de abajo; devuelve dónde entra la señal. */
  led(key: string, board: string, col: number, color: string, ohms = 220): Ref {
    this.put(`${key}r`, 'resistor', board, col, 'j', { resistance: ohms });
    this.put(key, 'led', board, col + 3, 'f', { color });
    this.gnd([key, 'K']);
    return [`${key}r`, '1'];
  }

  /** Un riel entero reservado (por ejemplo, un bus que no es la alimentación). */
  reserve(board: string, hole: string) {
    this.used.add(`${board}:${hole}`);
  }

  railHole(board: string, kind: string, col: number): Ref {
    return this.rail(board, kind, col);
  }

  template(meta: Omit<Template, 'parts' | 'wires'>): Template {
    return { ...meta, parts: this.parts, wires: this.wires };
  }
}

const LEDS = ['red', 'yellow', 'green', 'blue'];

function counter4(): Template {
  const t = new Rig();
  t.board('bb1', 0, 0);
  t.board('bb2', 400, 0);
  t.power('psu', 0, -70, ['bb1', 'bb2']);
  t.put('clk', 'clock', 'bb1', 5, 'c', { frequency: 2, duty: 50 });
  t.dip('cnt', '74hc161', 'bb1', 9);
  t.gnd(['clk', 'GND']);
  t.wire(['clk', 'OUT'], ['cnt', 'CP'], YELLOW);
  t.vcc(['cnt', 'VCC']);
  t.gnd(['cnt', 'GND']);
  for (const p of ['MR', 'CEP', 'CET', 'PE']) t.vcc(['cnt', p]);
  for (let i = 0; i < 4; i++) t.gnd(['cnt', `D${i}`]);
  for (let i = 0; i < 4; i++) t.wire(['cnt', `Q${i}`], t.led(`l${i}`, 'bb2', 5 + 6 * i, LEDS[i]));
  return t.template({
    id: 'counter4',
    name: 'Contador binario de 4 bits',
    summary: 'Un reloj de 2 Hz y un 74HC161 cuentan de 0 a 15; cuatro LEDs en otra protoboard muestran los bits.',
    level: 'Intermedio',
    category: 'Lógica secuencial',
  });
}

function decade(): Template {
  const t = new Rig();
  t.board('bb1', 0, 0);
  t.board('bb2', 400, 0);
  t.board('bb3', 800, 0);
  t.power('psu', 0, -70, ['bb1', 'bb2', 'bb3'], { skipPlus: ['bb3'] });

  // Placa 1: reloj, contador y la puerta que lo devuelve a cero tras el 9.
  t.put('clk', 'clock', 'bb1', 5, 'c', { frequency: 2, duty: 50 });
  t.dip('cnt', '74hc161', 'bb1', 9);
  t.dip('nand', '74hc00', 'bb1', 20);
  t.gnd(['clk', 'GND']);
  t.wire(['clk', 'OUT'], ['cnt', 'CP'], YELLOW);
  for (const p of ['VCC', 'MR', 'CEP', 'CET']) t.vcc(['cnt', p]);
  t.gnd(['cnt', 'GND']);
  for (let i = 0; i < 4; i++) t.gnd(['cnt', `D${i}`]);
  t.vcc(['nand', 'VCC']);
  t.gnd(['nand', 'GND']);
  for (const p of ['1A', '1B', '2A', '2B', '3A', '3B']) t.gnd(['nand', p]);
  // Con 1001 (9) la NAND baja PE y el siguiente flanco carga 0000.
  t.wire(['cnt', 'Q0'], ['nand', '4A'], BLUE, 54);
  t.wire(['cnt', 'Q3'], ['nand', '4B'], GREEN, 48);
  t.wire(['nand', '4Y'], ['cnt', 'PE'], ORANGE, 42);

  // Placa 2: decodificador BCD → 7 segmentos.
  t.dip('dec', 'cd4511', 'bb2', 5);
  for (const p of ['VDD', 'LT', 'BL']) t.vcc(['dec', p]);
  for (const p of ['VSS', 'LE']) t.gnd(['dec', p]);
  (['A', 'B', 'C', 'D'] as const).forEach((pin, i) => t.wire(['cnt', `Q${i}`], ['dec', pin]));

  // Placa 3: el display de cátodo común, con una resistencia en el cátodo.
  t.put('seg', 'seven-segment', 'bb3', 5, 'c');
  for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) t.wire(['dec', `S${s.toUpperCase()}`], ['seg', s], PURPLE);
  t.put('rc', 'resistor', 'bb3', 12, 'a', { resistance: 330 });
  t.wire(['seg', 'COM1'], ['rc', '1'], BLACK, 52);
  t.gnd(['rc', '2']);
  return t.template({
    id: 'decade',
    name: 'Contador de década con display',
    summary: 'Cuenta de 0 a 9 en un display de 7 segmentos: contador, decodificador y display en tres protoboards.',
    level: 'Avanzado',
    category: 'Lógica secuencial',
  });
}

function chaser(): Template {
  const t = new Rig();
  t.board('bb1', 0, 0);
  t.board('bb2', 400, 0);
  t.board('bb3', 800, 0);
  t.power('psu', 0, -70, ['bb1', 'bb2', 'bb3'], { skipPlus: ['bb3'] });

  // Placa 1: 555 como oscilador astable (R1 = 1 kΩ, R2 = 33 kΩ, C = 4,7 µF ≈ 4,6 Hz).
  t.dip('osc', 'ne555', 'bb1', 5);
  t.vcc(['osc', 'VCC']);
  t.gnd(['osc', 'GND']);
  t.vcc(['osc', 'RESET']);
  t.wire(['osc', 'TRIG'], ['osc', 'THR'], GREEN);
  t.put('r1', 'resistor', 'bb1', 12, 'j', { resistance: 1000 });
  t.put('r2', 'resistor', 'bb1', 16, 'i', { resistance: 33000 });
  t.put('c1', 'capacitor', 'bb1', 19, 'f', { capacitance: 4.7e-6 });
  t.vcc(['r1', '1']);
  t.wire(['osc', 'DIS'], ['r1', '2'], ORANGE);
  t.wire(['osc', 'THR'], ['r2', '2'], BLUE);
  t.gnd(['c1', '-']);

  // Placa 2: contador de década; sus diez salidas encienden una a una.
  t.dip('cnt', 'cd4017', 'bb2', 5);
  t.vcc(['cnt', 'VDD']);
  for (const p of ['VSS', 'INH', 'RST']) t.gnd(['cnt', p]);
  t.wire(['osc', 'OUT'], ['cnt', 'CLK'], YELLOW);

  // Placa 3: barra de 10 LEDs; todos los cátodos al bus del riel +, con una sola resistencia a masa.
  t.dip('bar', 'led-bar-10', 'bb3', 5, { color: 'red' });
  for (let i = 1; i <= 10; i++) t.wire(['bar', `K${i}`], t.railHole('bb3', 'tp', 4 + i), ORANGE);
  t.put('rb', 'resistor', 'bb3', 20, 'b', { resistance: 220 });
  t.wire(t.railHole('bb3', 'tp', 20), ['rb', '1'], ORANGE);
  t.gnd(['rb', '2']);
  for (let i = 0; i < 10; i++) t.wire(['cnt', `Q${i}`], ['bar', `A${i + 1}`]);
  return t.template({
    id: 'chaser',
    name: 'Luces secuenciales',
    summary: 'Un 555 marca el ritmo y un CD4017 enciende una a una las diez luces de una barra. Tres protoboards.',
    level: 'Avanzado',
    category: 'Lógica secuencial',
  });
}

function freqdiv(): Template {
  const t = new Rig();
  t.board('bb1', 0, 0);
  t.board('bb2', 400, 0);
  t.power('psu', 0, -70, ['bb1', 'bb2']);
  t.put('clk', 'clock', 'bb1', 5, 'c', { frequency: 8, duty: 50 });
  t.gnd(['clk', 'GND']);

  // Cuatro biestables D en cadena, cada uno con D = Q̅ para que alterne: ÷2, ÷4, ÷8 y ÷16.
  t.dip('ffa', '74hc74', 'bb1', 9);
  t.dip('ffb', '74hc74', 'bb1', 19);
  for (const k of ['ffa', 'ffb']) {
    t.vcc([k, 'VCC']);
    t.gnd([k, 'GND']);
    for (const p of ['1CLR', '1PRE', '2CLR', '2PRE']) t.vcc([k, p]);
    t.wire([k, '1D'], [k, '1QN'], GREEN, 186);
    t.wire([k, '2D'], [k, '2QN'], GREEN, 44);
  }
  t.wire(['clk', 'OUT'], ['ffa', '1CLK'], YELLOW);
  t.wire(['ffa', '1Q'], ['ffa', '2CLK'], BLUE);
  t.wire(['ffa', '2Q'], ['ffb', '1CLK'], BLUE);
  t.wire(['ffb', '1Q'], ['ffb', '2CLK'], BLUE);

  const outs: Ref[] = [['ffa', '1Q'], ['ffa', '2Q'], ['ffb', '1Q'], ['ffb', '2Q']];
  outs.forEach((o, i) => t.wire(o, t.led(`l${i}`, 'bb2', 5 + 6 * i, LEDS[i])));
  return t.template({
    id: 'freqdiv',
    name: 'Divisor de frecuencia',
    summary: 'Cuatro biestables D en cadena dividen un reloj de 8 Hz entre 2, 4, 8 y 16. Verás los LEDs bajar de ritmo.',
    level: 'Intermedio',
    category: 'Lógica secuencial',
  });
}

export const SEQUENTIAL: Template[] = [counter4(), freqdiv(), decade(), chaser()];
