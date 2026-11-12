// Catálogo del modo diseño: geometría de patillas (rejilla de 10) y comportamiento lógico de
// cada elemento. El dibujo vive en src/ui/design/symbols.tsx; aquí no hay React.
import type { Props } from '../core/types';
import { PARTS, PART_LIST } from '../parts';
import type { ChipSpec } from '../parts/chips';
import { IC_PREFIX, X, type Bit, type LogicSheet } from './types';

/** Salida de un elemento: un bit o Z (no conduce, como un triestado desactivado). */
export type Drive = Bit | 3;
export const Z: Drive = 3;

export interface LogicPinDef {
  id: string;
  x: number;
  y: number;
  dir: 'in' | 'out';
  label?: string;
}

export interface Behavior {
  /** Entradas en el orden de sus patillas de entrada; devuelve las salidas en su orden. */
  step(inputs: Bit[]): Drive[];
}

/** Un circuito anidado: lo que necesita un integrado propio para evaluarse. */
export interface Instance {
  set(inputs: Bit[]): void;
  outputs(): Bit[];
}

export interface ElementCtx {
  sheet(id: string): LogicSheet | undefined;
  instantiate(sheetId: string): Instance | null;
}

export interface Env {
  /** Valor actual de una fuente (entrada, botón, reloj). */
  source(): Bit;
}

export interface LogicField {
  key: string;
  label: string;
  kind: 'number' | 'select' | 'text' | 'longtext' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}

export type LogicGroup = 'Entradas y salidas' | 'Puertas' | 'Biestables' | 'Bloques' | 'Mis integrados' | 'Integrados 74HC y CD4000' | 'Anotaciones';
export const LOGIC_GROUPS: LogicGroup[] = ['Entradas y salidas', 'Puertas', 'Biestables', 'Bloques', 'Mis integrados', 'Integrados 74HC y CD4000', 'Anotaciones'];

export interface ElementDef {
  kind: string;
  name: string;
  group: LogicGroup;
  description: string;
  keywords: string[];
  /** Atajo de teclado para colocarlo. */
  key?: string;
  defaults: Props;
  fields?: LogicField[];
  size(props: Props, ctx: ElementCtx): { w: number; h: number };
  pins(props: Props, ctx: ElementCtx): LogicPinDef[];
  behavior(props: Props, ctx: ElementCtx, env: Env): Behavior;
  /** Fuente que el usuario maneja en vivo (interruptor, pulsador). */
  interactive?: 'toggle' | 'press';
}

const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
/** Valor de reposo de un pulsador: 0, o 1 si es activo en bajo. */
export const buttonIdle = (p: Props): Bit => (num(p.activeLow, 0) ? 1 : 0);
const inv = (b: Bit): Bit => (b === X ? X : b ? 0 : 1);

// ── Puertas ─────────────────────────────────────────────────────────────────────
const and = (v: Bit[]): Bit => (v.includes(0) ? 0 : v.includes(X) ? X : 1);
const or = (v: Bit[]): Bit => (v.includes(1) ? 1 : v.includes(X) ? X : 0);
const xor = (v: Bit[]): Bit => (v.includes(X) ? X : ((v.filter((b) => b === 1).length % 2) as Bit));

function gate(kind: string, name: string, fn: (v: Bit[]) => Bit, invert: boolean, key: string, description: string): ElementDef {
  return {
    kind,
    name,
    group: 'Puertas',
    description,
    keywords: [kind, 'puerta', 'compuerta', 'gate', name.toLowerCase()],
    key,
    defaults: { inputs: 2 },
    fields: [{ key: 'inputs', label: 'Entradas', kind: 'number', min: 2, max: 8 }],
    size: (p) => ({ w: 60, h: Math.max(40, 20 * gateInputs(p)) }),
    pins: (p) => {
      const n = gateInputs(p);
      const h = Math.max(40, 20 * n);
      return [
        ...Array.from({ length: n }, (_, i) => ({ id: `I${i + 1}`, x: 0, y: 10 + i * 20, dir: 'in' as const })),
        { id: 'Y', x: 60, y: h / 2, dir: 'out' as const },
      ];
    },
    behavior: () => ({ step: (v) => [invert ? inv(fn(v)) : fn(v)] }),
  };
}
export const gateInputs = (p: Props) => Math.max(2, Math.min(8, Math.round(num(p.inputs, 2))));

function unary(kind: string, name: string, invert: boolean, key: string, description: string): ElementDef {
  return {
    kind,
    name,
    group: 'Puertas',
    description,
    keywords: [kind, 'puerta', 'inversor', 'buffer', name.toLowerCase()],
    key,
    defaults: {},
    size: () => ({ w: 60, h: 40 }),
    pins: () => [
      { id: 'A', x: 0, y: 20, dir: 'in' },
      { id: 'Y', x: 60, y: 20, dir: 'out' },
    ],
    behavior: () => ({ step: ([a]) => [invert ? inv(a) : a] }),
  };
}


// ── Compuerta por tabla de verdad ───────────────────────────────────────────────
// El elemento se define por su tabla y la conserva: la tabla se guarda en el documento y se dibuja dentro del símbolo.
// Las filas van en orden binario con I1 como bit más significativo (00, 01, 10, 11 para dos entradas) y cada salida
// guarda una cadena de 2^n caracteres «0» o «1»; las salidas se separan con «;».
export const TT_MAX_IN = 4;
export const TT_MAX_OUT = 8;
const clampInt = (v: unknown, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, Math.round(num(v, d))));
export const ttInputs = (p: Props) => clampInt(p.inputs, 1, TT_MAX_IN, 2);
export const ttOutputs = (p: Props) => clampInt(p.outputs, 1, TT_MAX_OUT, 1);
export const ttRows = (p: Props) => 1 << ttInputs(p);
const letters = 'ABCDEFGH';
/** Nombres de las columnas: los del usuario separados por comas o, si faltan, A, B, C… para entradas y Y, Y2… para salidas. */
export function ttNames(p: Props, kind: 'in' | 'out'): string[] {
  const n = kind === 'in' ? ttInputs(p) : ttOutputs(p);
  const given = String(kind === 'in' ? p.inNames ?? '' : p.outNames ?? '').split(',').map((x) => x.trim().slice(0, 6));
  return Array.from({ length: n }, (_, i) => given[i] || (kind === 'in' ? letters[i] : i === 0 ? 'Y' : `Y${i + 1}`));
}
export const ttInPinId = (i: number) => `I${i + 1}`;
export const ttOutPinId = (p: Props, j: number) => (ttOutputs(p) === 1 ? 'Y' : `Y${j + 1}`);
/** Una cadena de 0/1 por salida, normalizada al tamaño actual (lo que falta se rellena con 0). */
export function ttColumns(p: Props): string[] {
  const rows = ttRows(p);
  const parts = String(p.table ?? '').split(';');
  return Array.from({ length: ttOutputs(p) }, (_, j) => (parts[j] ?? '').replace(/[^01]/g, '0').padEnd(rows, '0').slice(0, rows));
}
export const ttEncode = (columns: string[]) => columns.join(';');
/** Tablas de las compuertas básicas para n entradas. */
export function ttPreset(name: string, n: number): string {
  const rows = 1 << n;
  const bit = (i: number): number => {
    const ones = i.toString(2).split('').filter((c) => c === '1').length;
    switch (name) {
      case 'and': return i === rows - 1 ? 1 : 0;
      case 'or': return i === 0 ? 0 : 1;
      case 'nand': return i === rows - 1 ? 0 : 1;
      case 'nor': return i === 0 ? 1 : 0;
      case 'xor': return ones % 2;
      case 'xnor': return 1 - (ones % 2);
      case 'not': return i === 0 ? 1 : 0;
      default: return i; // buf
    }
  };
  return Array.from({ length: rows }, (_, i) => bit(i)).join('');
}
export const TT_PRESETS: { id: string; label: string; inputs: number }[] = [
  { id: 'and', label: 'AND', inputs: 2 }, { id: 'or', label: 'OR', inputs: 2 }, { id: 'nand', label: 'NAND', inputs: 2 },
  { id: 'nor', label: 'NOR', inputs: 2 }, { id: 'xor', label: 'XOR', inputs: 2 }, { id: 'xnor', label: 'XNOR', inputs: 2 },
  { id: 'not', label: 'NOT', inputs: 1 }, { id: 'buf', label: 'Buffer', inputs: 1 },
];
/** Salida de la tabla para entradas conocidas; con entradas sin valor, X salvo que todas las filas posibles coincidan. */
export function ttEvaluate(columns: string[], inputs: Bit[]): Bit[] {
  const n = inputs.length;
  const rows = 1 << n;
  const candidates: number[] = [];
  for (let r = 0; r < rows; r++) {
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const want = (r >> (n - 1 - i)) & 1;
      if (inputs[i] !== X && inputs[i] !== want) ok = false;
    }
    if (ok) candidates.push(r);
  }
  return columns.map((col) => {
    const first = col[candidates[0]];
    return candidates.every((r) => col[r] === first) ? (first === '1' ? 1 : 0) : X;
  });
}
const truthElement: ElementDef = {
  kind: 'tabla',
  name: 'Compuerta por tabla de verdad',
  group: 'Puertas',
  description: 'Una puerta definida por su tabla de verdad: la tabla se guarda con el elemento y se ve siempre dentro del símbolo. Elige AND, OR, NOT… o edita las casillas de salida.',
  keywords: ['tabla', 'tabla de verdad', 'truth', 'table', 'puerta', 'compuerta', 'and', 'or', 'not', 'logica'],
  key: 't',
  defaults: { label: 'AND', inputs: 2, outputs: 1, inNames: 'A,B', outNames: 'Y', table: ttPreset('and', 2) },
  fields: [
    { key: 'label', label: 'Nombre', kind: 'text' },
    { key: 'inputs', label: 'Entradas', kind: 'number', min: 1, max: TT_MAX_IN },
    { key: 'outputs', label: 'Salidas', kind: 'number', min: 1, max: TT_MAX_OUT },
    { key: 'inNames', label: 'Nombres de entradas', kind: 'text' },
    { key: 'outNames', label: 'Nombres de salidas', kind: 'text' },
  ],
  size: (p) => ttSize(p),
  pins: (p) => {
    const { w } = ttSize(p);
    return [
      ...Array.from({ length: ttInputs(p) }, (_, i) => ({ id: ttInPinId(i), x: 0, y: 10 + i * 20, dir: 'in' as const, label: ttNames(p, 'in')[i] })),
      ...Array.from({ length: ttOutputs(p) }, (_, j) => ({ id: ttOutPinId(p, j), x: w, y: 10 + j * 20, dir: 'out' as const, label: ttNames(p, 'out')[j] })),
    ];
  },
  behavior: (p) => {
    const columns = ttColumns(p);
    return { step: (v) => ttEvaluate(columns, v) };
  },
};
/** Tamaño del símbolo: ancho para las columnas y alto para las filas de la tabla (10 por fila) más la cabecera. */
export function ttSize(p: Props) {
  const cols = ttInputs(p) + ttOutputs(p);
  const w = Math.max(80, Math.ceil((24 + cols * 18) / 10) * 10);
  const h = Math.max(20 * Math.max(ttInputs(p), ttOutputs(p)) + 10, Math.ceil((22 + ttRows(p) * 10 + 8) / 10) * 10);
  return { w, h };
}

// ── Entradas y salidas ──────────────────────────────────────────────────────────
/** Entradas del display de 7 segmentos, de arriba abajo. */
export const SEGMENT_PINS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
/** Líneas de una nota (el texto admite saltos de línea). */
export const noteLines = (p: Props) => String(p.text ?? '').split(/\r?\n/);
export const NOTE_LINE = 13;
export const noteFontSize = (p: Props) => Math.max(9.5, Math.min(24, Number(p.fontSize) || 9.5));
export const noteLineHeight = (p: Props) => Math.round(NOTE_LINE * noteFontSize(p) / 9.5);
export const LED_COLORS = ['green', 'red', 'yellow', 'blue'] as const;
const LED_COLOR_NAMES: Record<(typeof LED_COLORS)[number], string> = { green: 'Verde', red: 'Rojo', yellow: 'Amarillo', blue: 'Azul' };
const SOURCE_PIN: LogicPinDef[] = [{ id: 'Y', x: 40, y: 10, dir: 'out' }];
const source = (env: Env): Behavior => ({ step: () => [env.source()] });

const ELEMENTS: ElementDef[] = [
  {
    kind: 'in',
    name: 'Entrada',
    group: 'Entradas y salidas',
    description: 'Interruptor de un bit: haz clic para cambiarlo. Dentro de un integrado es una patilla de entrada.',
    keywords: ['entrada', 'interruptor', 'switch', 'input', 'patilla', 'pin'],
    key: 'i',
    defaults: { label: '', value: 0 },
    fields: [{ key: 'label', label: 'Nombre', kind: 'text' }],
    size: () => ({ w: 40, h: 20 }),
    pins: () => SOURCE_PIN,
    behavior: (_p, _c, env) => source(env),
    interactive: 'toggle',
  },
  {
    kind: 'button',
    name: 'Pulsador',
    group: 'Entradas y salidas',
    description: 'Vale 1 mientras lo mantienes pulsado. Con «Activo en bajo» vale 1 en reposo y 0 mientras lo pulsas, como un pulsador con resistencia a VCC.',
    keywords: ['pulsador', 'boton', 'button', 'momentaneo', 'activo en bajo'],
    defaults: { label: '', activeLow: 0 },
    fields: [
      { key: 'label', label: 'Nombre', kind: 'text' },
      { key: 'activeLow', label: 'Activo en bajo (0 al pulsar)', kind: 'toggle' },
    ],
    size: () => ({ w: 40, h: 20 }),
    pins: () => SOURCE_PIN,
    behavior: (_p, _c, env) => source(env),
    interactive: 'press',
  },
  {
    kind: 'clock',
    name: 'Reloj',
    group: 'Entradas y salidas',
    description: 'Onda cuadrada con la frecuencia elegida. Pausa y avanza paso a paso desde la barra.',
    keywords: ['reloj', 'clock', 'clk', 'oscilador', 'pulso'],
    key: 'k',
    defaults: { label: 'CLK', hz: 1 },
    fields: [
      { key: 'label', label: 'Nombre', kind: 'text' },
      { key: 'hz', label: 'Frecuencia', kind: 'number', min: 0.1, max: 50, step: 0.1, unit: 'Hz' },
    ],
    size: () => ({ w: 40, h: 20 }),
    pins: () => SOURCE_PIN,
    behavior: (_p, _c, env) => source(env),
  },
  {
    kind: 'const',
    name: 'Constante',
    group: 'Entradas y salidas',
    description: 'Un 0 o un 1 fijo, como atar una entrada a GND o a VCC.',
    keywords: ['constante', 'vcc', 'gnd', 'alto', 'bajo', 'uno', 'cero'],
    defaults: { value: 1 },
    fields: [{ key: 'value', label: 'Valor', kind: 'select', options: [{ value: '0', label: '0 · GND' }, { value: '1', label: '1 · VCC' }] }],
    size: () => ({ w: 40, h: 20 }),
    pins: () => SOURCE_PIN,
    behavior: (p) => ({ step: () => [num(p.value, 1) ? 1 : 0] }),
  },
  {
    kind: 'out',
    name: 'Salida',
    group: 'Entradas y salidas',
    description: 'LED que muestra el bit que recibe. Dentro de un integrado es una patilla de salida.',
    keywords: ['salida', 'led', 'output', 'patilla', 'pin', 'sonda', 'probe'],
    key: 'o',
    defaults: { label: '', color: 'green' },
    fields: [
      { key: 'label', label: 'Nombre', kind: 'text' },
      { key: 'color', label: 'Color', kind: 'select', options: LED_COLORS.map((c) => ({ value: c, label: LED_COLOR_NAMES[c] })) },
    ],
    size: () => ({ w: 40, h: 20 }),
    pins: () => [{ id: 'A', x: 0, y: 10, dir: 'in' }],
    behavior: () => ({ step: () => [] }),
  },
  {
    kind: 'hex',
    name: 'Display hexadecimal',
    group: 'Entradas y salidas',
    description: 'Muestra en un dígito el número de 4 bits de sus entradas (1, 2, 4 y 8).',
    keywords: ['display', 'hexadecimal', '7 segmentos', 'digito', 'numero', 'bcd'],
    defaults: {},
    size: () => ({ w: 60, h: 80 }),
    pins: () => [1, 2, 4, 8].map((w, i) => ({ id: `D${i}`, x: 0, y: 10 + i * 20, dir: 'in' as const, label: String(w) })),
    behavior: () => ({ step: () => [] }),
  },
  {
    kind: 'seg7',
    name: 'Display de 7 segmentos',
    group: 'Entradas y salidas',
    description: 'Un dígito de siete segmentos: cada entrada (a–g) enciende su segmento. Se conecta a un decodificador BCD como el 74LS48.',
    keywords: ['display', '7 segmentos', 'siete segmentos', 'digito', 'segmentos', 'catodo comun', 'a b c d e f g'],
    defaults: {},
    // Misma altura y paso que un bloque de 7 salidas: los cables al decodificador quedan rectos.
    size: () => ({ w: 90, h: 160 }),
    pins: () => SEGMENT_PINS.map((id, i) => ({ id, x: 90, y: 20 + i * 20, dir: 'in' as const })),
    behavior: () => ({ step: () => [] }),
  },
  gate('and', 'AND', and, false, 'a', 'Sale 1 solo si todas sus entradas valen 1.'),
  gate('or', 'OR', or, false, '', 'Sale 1 si alguna de sus entradas vale 1.'),
  gate('nand', 'NAND', and, true, 'n', 'AND negada: sale 0 solo si todas sus entradas valen 1.'),
  gate('nor', 'NOR', or, true, '', 'OR negada: sale 1 solo si todas sus entradas valen 0.'),
  gate('xor', 'XOR', xor, false, 'x', 'Sale 1 si un número impar de entradas vale 1.'),
  gate('xnor', 'XNOR', xor, true, '', 'XOR negada: sale 1 si un número par de entradas vale 1.'),
  unary('not', 'NOT', true, 'v', 'Inversor: sale lo contrario de su entrada.'),
  unary('buf', 'Buffer', false, '', 'Repite su entrada. Útil para separar ramas de un circuito.'),
  truthElement,
  {
    kind: 'tri',
    name: 'Buffer triestado',
    group: 'Puertas',
    description: 'Con EN = 1 repite A; con EN = 0 suelta la salida (Z) para compartir un bus.',
    keywords: ['triestado', 'tristate', 'bus', 'enable', 'buffer', 'z'],
    defaults: {},
    size: () => ({ w: 60, h: 40 }),
    pins: () => [
      { id: 'A', x: 0, y: 20, dir: 'in' },
      { id: 'EN', x: 30, y: 40, dir: 'in' },
      { id: 'Y', x: 60, y: 20, dir: 'out' },
    ],
    behavior: () => ({ step: ([a, en]) => [en === 1 ? a : en === 0 ? Z : X] }),
  },
  {
    kind: 'dff',
    name: 'Biestable D',
    group: 'Biestables',
    description: 'Copia D en Q en cada flanco de subida del reloj. R y S, activas en alto, lo borran o lo ponen a 1 al instante.',
    keywords: ['biestable', 'flip flop', 'flipflop', 'd', 'registro', 'memoria', '74'],
    key: 'd',
    defaults: {},
    size: () => ({ w: 60, h: 60 }),
    pins: () => [
      { id: 'D', x: 0, y: 10, dir: 'in' },
      { id: 'CLK', x: 0, y: 50, dir: 'in' },
      { id: 'S', x: 30, y: 0, dir: 'in' },
      { id: 'R', x: 30, y: 60, dir: 'in' },
      { id: 'Q', x: 60, y: 10, dir: 'out' },
      { id: 'QN', x: 60, y: 50, dir: 'out', label: 'Q̅' },
    ],
    behavior: () => flipflop((_q, [d]) => d, { data: [0], c: 1, s: 2, r: 3 }),
  },
  {
    kind: 'jkff',
    name: 'Biestable JK',
    group: 'Biestables',
    description: 'En el flanco de subida: J pone a 1, K pone a 0 y J = K = 1 conmuta.',
    keywords: ['biestable', 'flip flop', 'jk', 'contador', 'memoria'],
    defaults: {},
    size: () => ({ w: 60, h: 60 }),
    pins: () => [
      { id: 'J', x: 0, y: 10, dir: 'in' },
      { id: 'CLK', x: 0, y: 30, dir: 'in' },
      { id: 'K', x: 0, y: 50, dir: 'in' },
      { id: 'S', x: 30, y: 0, dir: 'in' },
      { id: 'R', x: 30, y: 60, dir: 'in' },
      { id: 'Q', x: 60, y: 10, dir: 'out' },
      { id: 'QN', x: 60, y: 50, dir: 'out', label: 'Q̅' },
    ],
    behavior: () => flipflop((q, [j, k]) => (j === X || k === X ? X : j && k ? inv(q) : j ? 1 : k ? 0 : q), { data: [0, 2], c: 1, s: 3, r: 4 }),
  },
  {
    kind: 'tff',
    name: 'Biestable T',
    group: 'Biestables',
    description: 'Con T = 1 conmuta en cada flanco de subida: divide la frecuencia entre dos.',
    keywords: ['biestable', 'flip flop', 't', 'toggle', 'divisor', 'contador'],
    defaults: {},
    size: () => ({ w: 60, h: 60 }),
    pins: () => [
      { id: 'T', x: 0, y: 10, dir: 'in' },
      { id: 'CLK', x: 0, y: 50, dir: 'in' },
      { id: 'S', x: 30, y: 0, dir: 'in' },
      { id: 'R', x: 30, y: 60, dir: 'in' },
      { id: 'Q', x: 60, y: 10, dir: 'out' },
      { id: 'QN', x: 60, y: 50, dir: 'out', label: 'Q̅' },
    ],
    behavior: () => flipflop((q, [t]) => (t === X ? X : t ? inv(q) : q), { data: [0], c: 1, s: 2, r: 3 }),
  },
  {
    kind: 'srlatch',
    name: 'Latch SR',
    group: 'Biestables',
    description: 'S pone Q a 1 y R a 0; sin ninguna, recuerda. S = R = 1 no está permitido. Al arrancar vale X (desconocido) salvo que elijas un estado inicial.',
    keywords: ['latch', 'sr', 'set', 'reset', 'cerrojo', 'memoria'],
    defaults: { init: 2 },
    fields: [{ key: 'init', label: 'Estado inicial', kind: 'select', options: [{ value: '2', label: 'X · desconocido' }, { value: '0', label: '0' }, { value: '1', label: '1' }] }],
    size: () => ({ w: 60, h: 40 }),
    pins: () => [
      { id: 'S', x: 0, y: 10, dir: 'in' },
      { id: 'R', x: 0, y: 30, dir: 'in' },
      { id: 'Q', x: 60, y: 10, dir: 'out' },
      { id: 'QN', x: 60, y: 30, dir: 'out', label: 'Q̅' },
    ],
    behavior: (p) => {
      let q: Bit = ([0, 1].includes(num(p.init, 2)) ? num(p.init, 2) : X) as Bit;
      return {
        step: ([s, r]) => {
          if (s === 1 && r === 1) q = X;
          else if (s === 1) q = 1;
          else if (r === 1) q = 0;
          return [q, inv(q)];
        },
      };
    },
  },
  {
    kind: 'mux2',
    name: 'Multiplexor 2 a 1',
    group: 'Bloques',
    description: 'Y = I0 si S = 0 e Y = I1 si S = 1.',
    keywords: ['multiplexor', 'mux', 'selector', 'conmutador'],
    defaults: {},
    size: () => ({ w: 50, h: 60 }),
    pins: () => [
      { id: 'I0', x: 0, y: 20, dir: 'in' },
      { id: 'I1', x: 0, y: 40, dir: 'in' },
      { id: 'S', x: 30, y: 60, dir: 'in' },
      { id: 'Y', x: 50, y: 30, dir: 'out' },
    ],
    behavior: () => ({ step: ([a, b, s]) => [s === 0 ? a : s === 1 ? b : a === b ? a : X] }),
  },
  {
    kind: 'note',
    name: 'Nota',
    group: 'Anotaciones',
    description: 'Texto para explicar una parte del circuito.',
    keywords: ['nota', 'texto', 'comentario', 'etiqueta', 'anotacion'],
    defaults: { text: 'Nota' },
    fields: [{ key: 'text', label: 'Texto', kind: 'longtext' }, { key: 'fontSize', label: 'Tamaño del texto', kind: 'number', min: 10, max: 24, step: 1 }],
    size: (p) => {
      const lines = noteLines(p);
      return { w: Math.max(40, Math.ceil((Math.max(...lines.map((l) => l.length)) * 7 * noteFontSize(p) / 9.5 + 16) / 10) * 10), h: Math.ceil((lines.length * noteLineHeight(p) + 7) / 10) * 10 };
    },
    pins: () => [],
    behavior: () => ({ step: () => [] }),
  },
];

/**
 * Biestable disparado por flanco de subida con S y R asíncronas (activas en alto).
 * `data` son los índices de sus entradas de datos; CLK, S y R van en `c`, `s` y `r`.
 */
function flipflop(next: (q: Bit, data: Bit[]) => Bit, pins: { data: number[]; c: number; s: number; r: number }): Behavior {
  let q: Bit = 0;
  let clk: Bit = X;
  return {
    step(v) {
      const c = v[pins.c];
      if (c === 1 && clk === 0) q = next(q, pins.data.map((i) => v[i]));
      clk = c;
      const s = v[pins.s];
      const r = v[pins.r];
      if (r === 1 && s === 1) q = X;
      else if (r === 1) q = 0;
      else if (s === 1) q = 1;
      return [q, inv(q)];
    },
  };
}

// ── Integrados del catálogo como bloques ──────────────────────────────────────────
/** Las patillas lógicas de un ChipSpec: sin alimentación ni NC; nombres repetidos una vez. */
export function chipPins(spec: ChipSpec<unknown>) {
  const skip = new Set([spec.vcc, spec.gnd, spec.rail, 'NC', 'COM']);
  const seen = new Set<string>();
  const names = spec.pins.filter((n) => !skip.has(n) && !seen.has(n) && (seen.add(n), true));
  return { inputs: names.filter((n) => !spec.outputs.includes(n)), outputs: names.filter((n) => spec.outputs.includes(n)) };
}

/** Con «flip» las entradas pasan a la derecha y las salidas a la izquierda; los rótulos siguen derechos. */
export function visualPinOrder(pins: { id: string }[], value: unknown): string[] {
  let saved: unknown = [];
  try { if (typeof value === 'string') saved = JSON.parse(value); } catch { /* Ignore malformed legacy data. */ }
  const ids = pins.map(p => p.id);
  const valid = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && ids.includes(id)) : [];
  return [...new Set([...valid, ...ids])];
}
function blockPins(inputs: { id: string; label?: string }[], outputs: { id: string; label?: string }[], props: Props): LogicPinDef[] {
  const flip = flipped(props), width = blockWidth(props), spacing = pinSpacing(props);
  const ins = visualPinOrder(inputs, props.inputOrder), outs = visualPinOrder(outputs, props.outputOrder);
  return [
    ...inputs.map((p) => ({ ...p, x: flip ? width : 0, y: 20 + ins.indexOf(p.id) * spacing, dir: 'in' as const })),
    ...outputs.map((p) => ({ ...p, x: flip ? 0 : width, y: 20 + outs.indexOf(p.id) * spacing, dir: 'out' as const })),
  ];
}
const flipped = (p: Props) => num(p.flip, 0) === 1;
const FLIP_FIELD: LogicField = {
  key: 'flip',
  label: 'Lados',
  kind: 'select',
  options: [
    { value: '0', label: 'Entradas a la izquierda' },
    { value: '1', label: 'Entradas a la derecha' },
  ],
};
const blockWidth = (p: Props) => Math.max(100, Math.min(240, Math.round(num(p.blockWidth, 100) / 10) * 10));
const pinSpacing = (p: Props) => Math.max(20, Math.min(40, Math.round(num(p.pinSpacing, 20) / 10) * 10));
const blockSize = (inputs: number, outputs: number, p: Props) => ({ w: blockWidth(p), h: pinSpacing(p) * (Math.max(inputs, outputs, 1) - 1) + 40 });
const BLOCK_FIELDS: LogicField[] = [FLIP_FIELD,
  { key: 'blockWidth', label: 'Ancho del integrado', kind: 'number', min: 100, max: 240, step: 10 },
  { key: 'pinSpacing', label: 'Espacio entre patillas', kind: 'number', min: 20, max: 40, step: 10 },
  { key: 'titlePosition', label: 'Posición del título', kind: 'select', options: [
    { value: 'above', label: 'Arriba' }, { value: 'inside', label: 'Dentro' }, { value: 'below', label: 'Abajo' }, { value: 'hidden', label: 'Oculto' },
  ] },
  { key: 'titleSize', label: 'Tamaño del título', kind: 'number', min: 7, max: 20, step: 1 },
];
const BLOCK_DEFAULTS = { flip: 0, blockWidth: 100, pinSpacing: 20, titlePosition: 'above', titleSize: 9 };

function chipElement(type: string, spec: ChipSpec<unknown>): ElementDef {
  const { inputs, outputs } = chipPins(spec);
  return {
    kind: `chip:${type}`,
    name: spec.part,
    group: 'Integrados 74HC y CD4000',
    description: `${spec.name}. ${spec.description}`,
    keywords: [type, spec.part.toLowerCase(), ...spec.keywords],
    defaults: BLOCK_DEFAULTS,
    fields: BLOCK_FIELDS,
    size: (p) => blockSize(inputs.length, outputs.length, p),
    pins: (p) => blockPins(inputs.map((id) => ({ id })), outputs.map((id) => ({ id })), p),
    behavior: () => {
      let state = spec.init();
      let prev: Record<string, boolean> = {};
      const run = (now: Record<string, boolean>, s: unknown) => {
        const io = { v: (n: string) => now[n] ?? false, rise: (n: string) => !!now[n] && !prev[n], fall: (n: string) => !now[n] && !!prev[n] };
        const out = spec.evaluate(io, s as never);
        return outputs.map((n): Drive => (out[n] === true ? 1 : out[n] === false ? 0 : Z));
      };
      const levels = (v: Bit[], unknown: boolean) => Object.fromEntries(inputs.map((n, i) => [n, v[i] === X ? unknown : v[i] === 1]));
      return {
        step(v) {
          if (!v.includes(X)) {
            const now = levels(v, false);
            const out = run(now, state);
            prev = now;
            return out;
          }
          // Entradas sin valor: se prueba con 0 y con 1. Solo es X la salida que depende de ellas
          // (en un 74HC04 con cinco puertas sin usar, la sexta sigue funcionando).
          const s0 = structuredClone(state);
          const s1 = structuredClone(state);
          const low = levels(v, false);
          const o0 = run(low, s0);
          const o1 = run(levels(v, true), s1);
          if (JSON.stringify(s0) === JSON.stringify(s1)) state = s0;
          prev = low;
          return o0.map((o, i) => (o === o1[i] ? o : X));
        },
      };
    },
  };
}

// ── Integrados propios ───────────────────────────────────────────────────────────
/** Patillas de señal de un integrado propio en su orden: entradas y salidas. */
export function icSignals(sheet: LogicSheet) {
  const pins = sheet.nodes.filter((n) => n.kind === 'in' || n.kind === 'out');
  const ordered = [...sheet.order.flatMap((id) => pins.filter((n) => n.id === id)), ...pins.filter((n) => !sheet.order.includes(n.id))];
  return ordered;
}

export function pinName(node: { id: string; props: Props }, index: number) {
  const label = String(node.props.label ?? '').trim();
  return label || `P${index + 1}`;
}

function icElement(sheet: LogicSheet): ElementDef {
  const signals = icSignals(sheet);
  const ins = signals.filter((n) => n.kind === 'in');
  const outs = signals.filter((n) => n.kind === 'out');
  return {
    kind: `${IC_PREFIX}${sheet.id}`,
    name: sheet.part || sheet.name,
    group: 'Mis integrados',
    description: sheet.description || sheet.name,
    keywords: [sheet.name.toLowerCase(), sheet.part.toLowerCase(), 'integrado', 'propio', 'custom'],
    defaults: BLOCK_DEFAULTS,
    fields: BLOCK_FIELDS,
    size: (p) => blockSize(ins.length, outs.length, p),
    pins: (p) =>
      blockPins(
        ins.map((n) => ({ id: n.id, label: pinName(n, signals.indexOf(n)) })),
        outs.map((n) => ({ id: n.id, label: pinName(n, signals.indexOf(n)) })),
        p,
      ),
    behavior: (_p, ctx) => {
      const inner = ctx.instantiate(sheet.id);
      return {
        step(v) {
          if (!inner) return outs.map(() => X);
          inner.set(v);
          return inner.outputs();
        },
      };
    },
  };
}

// ── Registro ─────────────────────────────────────────────────────────────────────
const BASE = new Map(ELEMENTS.map((e) => [e.kind, e]));
let chipCache: Map<string, ElementDef> | null = null;

/** Integrados del catálogo con modelo lógico puro (sin interruptores analógicos ni potencia). */
export function chipElements() {
  if (!chipCache) {
    chipCache = new Map();
    for (const def of PART_LIST) {
      const spec = def.chip;
      if (!spec || def.type.startsWith(IC_PREFIX) || spec.extra || def.category !== 'Lógica') continue;
      chipCache.set(`chip:${def.type}`, chipElement(def.type, spec));
    }
  }
  return chipCache;
}

export function baseElements() {
  return ELEMENTS;
}

export function elementDef(kind: string, sheets: (id: string) => LogicSheet | undefined): ElementDef | undefined {
  if (kind.startsWith(IC_PREFIX)) {
    const sheet = sheets(kind.slice(IC_PREFIX.length));
    return sheet ? icElement(sheet) : undefined;
  }
  if (kind.startsWith('chip:')) {
    const hit = chipElements().get(kind);
    if (hit) return hit;
    const spec = PARTS[kind.slice(5)]?.chip;
    return spec ? chipElement(kind.slice(5), spec) : undefined;
  }
  return BASE.get(kind);
}
