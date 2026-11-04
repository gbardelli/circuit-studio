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
  kind: 'number' | 'select' | 'text' | 'toggle';
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

// ── Entradas y salidas ──────────────────────────────────────────────────────────
/** Entradas del display de 7 segmentos, de arriba abajo. */
export const SEGMENT_PINS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
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
    description: 'Vale 1 mientras lo mantienes pulsado.',
    keywords: ['pulsador', 'boton', 'button', 'momentaneo'],
    defaults: { label: '' },
    fields: [{ key: 'label', label: 'Nombre', kind: 'text' }],
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
    description: 'S pone Q a 1 y R a 0; sin ninguna, recuerda. S = R = 1 no está permitido.',
    keywords: ['latch', 'sr', 'set', 'reset', 'cerrojo', 'memoria'],
    defaults: {},
    size: () => ({ w: 60, h: 40 }),
    pins: () => [
      { id: 'S', x: 0, y: 10, dir: 'in' },
      { id: 'R', x: 0, y: 30, dir: 'in' },
      { id: 'Q', x: 60, y: 10, dir: 'out' },
      { id: 'QN', x: 60, y: 30, dir: 'out', label: 'Q̅' },
    ],
    behavior: () => {
      let q: Bit = X;
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
    fields: [{ key: 'text', label: 'Texto', kind: 'text' }],
    size: (p) => ({ w: Math.max(40, Math.ceil((String(p.text ?? '').length * 7 + 16) / 10) * 10), h: 20 }),
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
function blockPins(inputs: { id: string; label?: string }[], outputs: { id: string; label?: string }[], flip = false): LogicPinDef[] {
  return [
    ...inputs.map((p, i) => ({ ...p, x: flip ? 100 : 0, y: 20 + i * 20, dir: 'in' as const })),
    ...outputs.map((p, i) => ({ ...p, x: flip ? 0 : 100, y: 20 + i * 20, dir: 'out' as const })),
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
const blockSize = (inputs: number, outputs: number) => ({ w: 100, h: 20 * Math.max(inputs, outputs, 1) + 20 });

function chipElement(type: string, spec: ChipSpec<unknown>): ElementDef {
  const { inputs, outputs } = chipPins(spec);
  return {
    kind: `chip:${type}`,
    name: spec.part,
    group: 'Integrados 74HC y CD4000',
    description: `${spec.name}. ${spec.description}`,
    keywords: [type, spec.part.toLowerCase(), ...spec.keywords],
    defaults: { flip: 0 },
    fields: [FLIP_FIELD],
    size: () => blockSize(inputs.length, outputs.length),
    pins: (p) => blockPins(inputs.map((id) => ({ id })), outputs.map((id) => ({ id })), flipped(p)),
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
    defaults: { flip: 0 },
    fields: [FLIP_FIELD],
    size: () => blockSize(ins.length, outs.length),
    pins: (p) =>
      blockPins(
        ins.map((n) => ({ id: n.id, label: pinName(n, signals.indexOf(n)) })),
        outs.map((n) => ({ id: n.id, label: pinName(n, signals.indexOf(n)) })),
        flipped(p),
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
