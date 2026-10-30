// Circuitos integrados en encapsulado DIP: lógica 74HC/CD4000 y algunos clásicos (555, ULN2003,
// L293D). Cada chip se describe con su patillaje real y una función lógica; el modelo eléctrico
// es común: entradas de alta impedancia, salidas en contrafase hacia su propia alimentación y
// un retardo de propagación de 1 µs para que las cadenas de puertas y los contadores se comporten.
import { memo } from 'react';
import { Diode, Resistor, type Element } from '../core/solver';
import type { PinDef, Props } from '../core/types';
import type { PartDef, RenderProps, SimContext } from './types';

type Level = boolean | null; // null = alta impedancia

interface IO {
  /** Nivel lógico de una entrada (con histéresis). */
  v(name: string): boolean;
  rise(name: string): boolean;
  fall(name: string): boolean;
}

export interface ChipSpec<S = Record<string, number>> {
  type: string;
  part: string;
  name: string;
  family: string;
  description: string;
  keywords: string[];
  /** Nombre de cada patilla, empezando por la 1. Los nombres repetidos están unidos por dentro. */
  pins: string[];
  desc?: Record<string, string>;
  vcc: string | null;
  gnd: string;
  outputs: string[];
  inputThresholds?: { low: number; high: number };
  minSupply?: number;
  /** Salidas de colector abierto: solo tiran a tierra. */
  openDrain?: boolean;
  /** Alimentación de la que salen los niveles altos (si no es vcc). */
  rail?: string;
  init(): S;
  evaluate(io: IO, s: S): Record<string, Level>;
  /** Elementos extra (diodos de protección, interruptores analógicos). */
  extra?(net: (name: string) => number, levels: () => Record<string, Level>, io: () => IO | null): Element[];
}

const R_ON = 40;
const R_OFF = 1e9;
const PITCH = 10;
const ROW = 30; // 0,3": cruza justo el canal central de la protoboard

const COMMON: Record<string, string> = {
  VCC: 'Alimentación +5 V (admite 2–6 V)',
  VDD: 'Alimentación positiva (3–15 V)',
  GND: 'Tierra (0 V)',
  VSS: 'Tierra (0 V)',
  NC: 'Sin conexión',
};

/** Ids únicos: los nombres repetidos (GND en el L293D) se numeran como en las placas: GND.1, GND.2… */
function pinIds(names: string[]) {
  const total = new Map<string, number>();
  for (const n of names) total.set(n, (total.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((n) => {
    if (total.get(n) === 1) return n;
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return `${n}.${k}`;
  });
}

/** Patilla 1 abajo a la izquierda (muesca a la izquierda), numeración en sentido antihorario. */
export function dipPins(spec: Pick<ChipSpec<unknown>, 'pins' | 'desc'>): PinDef[] {
  const ids = pinIds(spec.pins);
  const half = spec.pins.length / 2;
  return spec.pins.map((name, i) => {
    const bottom = i < half;
    const x = bottom ? i * PITCH : (spec.pins.length - 1 - i) * PITCH;
    return {
      id: ids[i],
      x,
      y: bottom ? ROW : 0,
      kind: 'leg' as const,
      label: `${pretty(name)} · patilla ${i + 1}`,
      desc: spec.desc?.[name] ?? describe(name),
    };
  });
}

const overline = (s: string) => s.replace(/[A-Z]/g, (c) => c + '̅');

/** Nombre como en la hoja de datos: Q̅ para las salidas invertidas y barra en lo activo en bajo. */
function pretty(name: string) {
  const inv = /^(\d?Q\d?|Y)N$/.exec(name);
  if (inv) return inv[1].replace(/[A-Z]/, (c) => c + '̅');
  const low = /^(\d?)(OE|MR|PL|PE|CLR|PRE|LT|BL|BIRBO|RBI)$/.exec(name);
  if (low) return low[1] + overline(low[2]);
  return name.replace(/^S([A-G])$/, (_, l: string) => l.toLowerCase()).replace(/^(\w+)\.\d+$/, '$1');
}

function describe(name: string): string {
  if (COMMON[name]) return COMMON[name];
  let m = /^(\d)([A-D])$/.exec(name);
  if (m) return `Entrada ${m[2]} de la puerta ${m[1]}`;
  m = /^(\d)Y$/.exec(name);
  if (m) return `Salida de la puerta ${m[1]}`;
  return '';
}

// ── Encapsulado ─────────────────────────────────────────────────────────────────
export function DipBody({ count, part, maker }: { count: number; part: string; maker: string }) {
  const half = count / 2;
  const w = (half - 1) * PITCH + 10;
  return (
    <g>
      {Array.from({ length: half }, (_, i) => (
        <g key={i}>
          <path d={`M${i * PITCH - 1.8} -1h3.6v5h-3.6z M${i * PITCH - 1.8} ${ROW - 4}h3.6v5h-3.6z`} fill="url(#g-metal-v)" stroke="#61686e" strokeWidth="0.25" />
          <path d={`M${i * PITCH - 1.2} -.5v3 M${i * PITCH - 1.2} ${ROW - 1.5}v2`} stroke="#f5f6f6" strokeWidth="0.65" opacity="0.7" />
        </g>
      ))}
      <rect x={-5} y={4} width={w} height={ROW - 6} rx={1.6} fill="#0c0e10" />
      <rect x={-5} y={3} width={w} height={ROW - 6} rx={1.6} fill="url(#g-chip)" />
      <rect x={-3.7} y={4.4} width={w - 2.6} height={ROW - 9} rx={1.3} fill="url(#p-epoxy)" />
      <path d={`M-3.5 5h${w - 3}M-4 6v${ROW - 14}`} stroke="#d5d9dd" strokeOpacity="0.13" strokeWidth="0.65" fill="none" />
      <path d={`M-5 ${ROW / 2 - 3.2} a3.2 3.2 0 0 1 0 6.4`} fill="#0f1012" />
      <circle cx={0} cy={ROW - 8} r={1.3} fill="#0f1012" />
      <circle cx={w - 20} cy={ROW / 2} r={2.5} fill="#15171a" stroke="#484a4e" strokeOpacity="0.4" strokeWidth="0.3" />
      <text x={(w - 10) / 2} y={ROW / 2 + 0.6} textAnchor="middle" fontSize={count > 16 ? 5.6 : 5} fontWeight={600} fill="#c9ccd1" opacity={0.85} letterSpacing={0.2} fontFamily="Geist, sans-serif">
        {part}
      </text>
      <text x={(w - 10) / 2} y={ROW / 2 + 6.4} textAnchor="middle" fontSize={3.3} fill="#9aa0a8" opacity={0.6} fontFamily="Geist, sans-serif">
        {maker} · E4
      </text>
    </g>
  );
}

// ── Modelo eléctrico común ──────────────────────────────────────────────────────
function chipSim<S>(spec: ChipSpec<S>) {
  return (ctx: SimContext) => {
    const ids = pinIds(spec.pins);
    const first = new Map<string, string>();
    spec.pins.forEach((n, i) => first.has(n) || first.set(n, ids[i]));
    const net = (name: string) => ctx.net(first.get(name) ?? name);
    const gnd = net(spec.gnd);
    const vcc = spec.vcc ? net(spec.vcc) : -1;
    const rail = spec.rail ? net(spec.rail) : vcc;
    const special = new Set([spec.vcc, spec.gnd, spec.rail, 'NC', 'COM', ...spec.outputs]);
    const inputs = [...new Set(spec.pins.filter((n) => !special.has(n)))];

    let state = spec.init();
    let levels: Record<string, Level> = {};
    const now: Record<string, boolean> = {};
    const prev: Record<string, boolean> = {};
    let t = 0;
    let settle = -1;
    let dirty = false;
    let powered = false;
    let lastIo: IO | null = null;

    const elements: Element[] = [];
    if (spec.vcc) elements.push(new Resistor(vcc, gnd, () => 100_000)); // consumo en reposo
    for (const name of inputs) elements.push(new Resistor(net(name), gnd, () => 10_000_000));
    for (const o of spec.outputs) {
      const n = net(o);
      if (!spec.openDrain) elements.push(new Resistor(n, rail, () => (levels[o] === true ? R_ON : R_OFF)));
      elements.push(new Resistor(n, gnd, () => (levels[o] === false ? (spec.openDrain ? 8 : R_ON) : R_OFF)));
    }
    if (spec.extra) elements.push(...spec.extra(net, () => levels, () => lastIo));

    const io: IO = {
      v: (n) => now[n] ?? false,
      rise: (n) => !!now[n] && !prev[n],
      fall: (n) => !now[n] && !!prev[n],
    };

    return {
      elements,
      changed: () => {
        const d = dirty;
        dirty = false;
        return d;
      },
      nextEvent: () => (settle > t ? settle : null),
      tracker: {
        sample(v: Float64Array, dt: number) {
          t += dt;
          const at = (n: number) => (n < 0 ? 0 : v[n]);
          const ref = at(gnd);
          const supply = spec.vcc ? at(vcc) - ref : 5;
          const on = supply >= (spec.minSupply ?? 1.6);
          if (!on) {
            if (powered) {
              powered = false;
              state = spec.init();
              levels = {};
              lastIo = null;
              dirty = true;
            }
            return;
          }
          const span = Math.max(supply, 2);
          for (const n of inputs) {
            const volts = at(net(n)) - ref;
            prev[n] = now[n] ?? false;
            now[n] = prev[n] ? volts > (spec.inputThresholds?.low ?? 0.35 * span) : volts > (spec.inputThresholds?.high ?? 0.55 * span);
          }
          if (!powered) for (const n of inputs) prev[n] = now[n]; // al encender no hay flancos
          powered = true;
          lastIo = io;
          // Los interruptores analógicos dependen directamente de las entradas.
          if (spec.extra && inputs.some((n) => now[n] !== prev[n])) {
            dirty = true;
            settle = t + 1e-6;
          }
          const next = spec.evaluate(io, state);
          for (const o of spec.outputs) {
            const lv = next[o] ?? null;
            if (levels[o] !== lv) {
              levels = { ...levels, ...next };
              dirty = true;
              settle = t + 1e-6;
              break;
            }
          }
          for (const n of inputs) prev[n] = now[n];
        },
        read: () => ({ powered }),
      },
    };
  };
}

function chipDef<S>(spec: ChipSpec<S>, maker = 'TI'): PartDef {
  const pins = dipPins(spec);
  const half = spec.pins.length / 2;
  const groups = new Map<string, string[]>();
  for (const p of pins) {
    const base = p.id.replace(/\.\d+$/, '');
    if (base !== p.id && base !== 'NC') groups.set(base, [...(groups.get(base) ?? []), p.id]);
  }
  const Render = memo(function ChipRender(_: RenderProps) {
    return <DipBody count={spec.pins.length} part={spec.part} maker={maker} />;
  });
  return {
    type: spec.type,
    name: spec.name,
    partNumber: spec.part,
    family: spec.family,
    category: spec.family === 'Controladores y temporizadores' ? 'Integrados' : 'Lógica',
    description: spec.description,
    keywords: [...spec.keywords, spec.part.toLowerCase(), ...aliases(spec.part), spec.family.toLowerCase(), 'chip', 'integrado', 'ic', 'dip'],
    defaults: {},
    pins: () => pins,
    bounds: () => ({ x: -6, y: -2, w: (half - 1) * PITCH + 12, h: ROW + 4 }),
    internal: groups.size ? () => [...groups.values()] : undefined,
    ground: [pinIds(spec.pins)[spec.pins.indexOf(spec.gnd)]],
    pinRole: (id) => {
      const name = id.replace(/.d+$/, '');
      if (name === spec.vcc) return 'power';
      if (name === spec.gnd) return 'ground';
      if (name === 'NC') return 'nc';
      return spec.outputs.includes(name) ? 'out' : 'in';
    },
    model: 'Comportamental',
    sim: chipSim(spec),
    Render,
    thumbScale: 1.1,
  };
}

/** 74HC00 también se encuentra como 7400, 74LS00, 74HCT00, SN74HC00… */
function aliases(part: string) {
  if (part === '7473') return ['sn7473', 'pulse triggered', 'maestro esclavo'];
  if (part === '74LS73A') return ['sn74ls73a', 'ls73a', 'negative edge'];
  const m = /^74[A-Z]*(\d+)$/.exec(part);
  if (m) return [`74${m[1]}`, `74ls${m[1]}`, `74hc${m[1]}`, `74hct${m[1]}`, `sn74hc${m[1]}`];
  const c = /^CD(\d+)/.exec(part);
  if (c) return [c[1], `cd${c[1]}b`, `hef${c[1]}`, `mc14${c[1].slice(1)}`];
  return [];
}

const bits = (io: IO, names: string[]) => names.reduce((acc, n, i) => acc | ((io.v(n) ? 1 : 0) << i), 0);
const outBits = (names: string[], value: number, on: Level = true) =>
  Object.fromEntries(names.map((n, i) => [n, on === null ? null : !!((value >> i) & 1)])) as Record<string, Level>;

// ── Puertas ─────────────────────────────────────────────────────────────────────
const P7400 = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
const P7402 = ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'];
const P7404 = ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'];
const P7410 = ['1A', '1B', '2A', '2B', '2C', '2Y', 'GND', '3Y', '3A', '3B', '3C', '1Y', '1C', 'VCC'];
const P7420 = ['1A', '1B', 'NC', '1C', '1D', '1Y', 'GND', '2Y', '2A', '2B', 'NC', '2C', '2D', 'VCC'];
const P4011 = ['1A', '1B', '1Y', '2Y', '2A', '2B', 'VSS', '3A', '3B', '3Y', '4Y', '4A', '4B', 'VDD'];

type Fn = (inputs: boolean[]) => boolean;
const AND: Fn = (x) => x.every(Boolean);
const OR: Fn = (x) => x.some(Boolean);
const XOR: Fn = (x) => x.filter(Boolean).length % 2 === 1;
const not = (f: Fn): Fn => (x) => !f(x);

function gates(pins: string[], count: number, ins: string[], fn: Fn) {
  const outputs = Array.from({ length: count }, (_, i) => `${i + 1}Y`);
  return {
    pins,
    outputs,
    init: () => ({}),
    evaluate: (io: IO) => Object.fromEntries(outputs.map((o, i) => [o, fn(ins.map((l) => io.v(`${i + 1}${l}`)))])),
  };
}

const TTL = { vcc: 'VCC', gnd: 'GND' };
const CMOS = { vcc: 'VDD', gnd: 'VSS' };
const GATES = 'Puertas lógicas';

const gateChips: ChipSpec<Record<string, never>>[] = [
  { type: '74hc00', part: '74HC00', name: 'Cuatro puertas NAND', description: 'Cuatro puertas NAND de dos entradas. La salida solo baja si ambas entradas están altas.', keywords: ['nand', 'no y', 'puerta', 'compuerta', 'and negada'], ...gates(P7400, 4, ['A', 'B'], not(AND)) },
  { type: '74hc02', part: '74HC02', name: 'Cuatro puertas NOR', description: 'Cuatro puertas NOR de dos entradas. Ojo: su patillaje no es el del 74HC00.', keywords: ['nor', 'no o', 'puerta', 'compuerta', 'or negada'], ...gates(P7402, 4, ['A', 'B'], not(OR)) },
  { type: '74hc04', part: '74HC04', name: 'Seis inversores', description: 'Seis puertas NOT. Cada salida es la entrada invertida.', keywords: ['not', 'inversor', 'negador', 'puerta', 'compuerta', 'hex inverter'], ...gates(P7404, 6, ['A'], (x) => !x[0]) },
  { type: '74hc08', part: '74HC08', name: 'Cuatro puertas AND', description: 'Cuatro puertas AND de dos entradas. La salida sube solo si ambas entradas están altas.', keywords: ['and', 'y', 'puerta', 'compuerta', 'conjuncion'], ...gates(P7400, 4, ['A', 'B'], AND) },
  { type: '74hc10', part: '74HC10', name: 'Tres puertas NAND de 3 entradas', description: 'Tres puertas NAND de tres entradas.', keywords: ['nand', 'triple', '3 entradas', 'puerta', 'compuerta'], ...gates(P7410, 3, ['A', 'B', 'C'], not(AND)) },
  { type: '74hc11', part: '74HC11', name: 'Tres puertas AND de 3 entradas', description: 'Tres puertas AND de tres entradas.', keywords: ['and', 'triple', '3 entradas', 'puerta', 'compuerta'], ...gates(P7410, 3, ['A', 'B', 'C'], AND) },
  { type: '74hc14', part: '74HC14', name: 'Seis inversores Schmitt', description: 'Seis inversores con disparador Schmitt: limpian señales lentas o con rebotes.', keywords: ['not', 'inversor', 'schmitt', 'trigger', 'antirrebote', 'puerta'], ...gates(P7404, 6, ['A'], (x) => !x[0]) },
  { type: '74hc20', part: '74HC20', name: 'Dos puertas NAND de 4 entradas', description: 'Dos puertas NAND de cuatro entradas.', keywords: ['nand', 'dual', '4 entradas', 'puerta', 'compuerta'], ...gates(P7420, 2, ['A', 'B', 'C', 'D'], not(AND)) },
  { type: '74hc27', part: '74HC27', name: 'Tres puertas NOR de 3 entradas', description: 'Tres puertas NOR de tres entradas.', keywords: ['nor', 'triple', '3 entradas', 'puerta', 'compuerta'], ...gates(P7410, 3, ['A', 'B', 'C'], not(OR)) },
  { type: '74hc32', part: '74HC32', name: 'Cuatro puertas OR', description: 'Cuatro puertas OR de dos entradas. La salida sube si alguna entrada está alta.', keywords: ['or', 'o', 'puerta', 'compuerta', 'disyuncion'], ...gates(P7400, 4, ['A', 'B'], OR) },
  { type: '74hc86', part: '74HC86', name: 'Cuatro puertas XOR', description: 'Cuatro puertas OR exclusiva: la salida sube si las entradas son distintas.', keywords: ['xor', 'o exclusiva', 'exor', 'puerta', 'compuerta', 'comparador'], ...gates(P7400, 4, ['A', 'B'], XOR) },
].map((g) => ({ ...g, family: GATES, ...TTL }) as ChipSpec<Record<string, never>>);

const cmosGates: ChipSpec<Record<string, never>>[] = [
  { type: 'cd4001', part: 'CD4001', name: 'Cuatro puertas NOR (CMOS)', description: 'Cuatro NOR de dos entradas de la serie 4000. Funciona de 3 a 15 V.', keywords: ['nor', 'cmos', '4000', 'puerta', 'compuerta'], ...gates(P4011, 4, ['A', 'B'], not(OR)) },
  { type: 'cd4011', part: 'CD4011', name: 'Cuatro puertas NAND (CMOS)', description: 'Cuatro NAND de dos entradas de la serie 4000. Funciona de 3 a 15 V.', keywords: ['nand', 'cmos', '4000', 'puerta', 'compuerta'], ...gates(P4011, 4, ['A', 'B'], not(AND)) },
  { type: 'cd4069', part: 'CD4069', name: 'Seis inversores (CMOS)', description: 'Seis puertas NOT de la serie 4000.', keywords: ['not', 'inversor', 'cmos', '4000', 'puerta'], ...gates(P7404.map((p) => (p === 'GND' ? 'VSS' : p === 'VCC' ? 'VDD' : p)), 6, ['A'], (x) => !x[0]) },
  { type: 'cd4070', part: 'CD4070', name: 'Cuatro puertas XOR (CMOS)', description: 'Cuatro OR exclusiva de la serie 4000.', keywords: ['xor', 'cmos', '4000', 'puerta', 'compuerta'], ...gates(P4011, 4, ['A', 'B'], XOR) },
  { type: 'cd4071', part: 'CD4071', name: 'Cuatro puertas OR (CMOS)', description: 'Cuatro OR de dos entradas de la serie 4000.', keywords: ['or', 'cmos', '4000', 'puerta', 'compuerta'], ...gates(P4011, 4, ['A', 'B'], OR) },
  { type: 'cd4077', part: 'CD4077', name: 'Cuatro puertas XNOR (CMOS)', description: 'Cuatro NOR exclusiva: la salida sube si las entradas son iguales.', keywords: ['xnor', 'nor exclusiva', 'igualdad', 'cmos', '4000', 'puerta'], ...gates(P4011, 4, ['A', 'B'], not(XOR)) },
  { type: 'cd4081', part: 'CD4081', name: 'Cuatro puertas AND (CMOS)', description: 'Cuatro AND de dos entradas de la serie 4000.', keywords: ['and', 'cmos', '4000', 'puerta', 'compuerta'], ...gates(P4011, 4, ['A', 'B'], AND) },
].map((g) => ({ ...g, family: GATES, ...CMOS }) as ChipSpec<Record<string, never>>);

const buffer125: ChipSpec<Record<string, never>> = {
  type: '74hc125',
  part: '74HC125',
  name: 'Cuatro búferes triestado',
  family: GATES,
  description: 'Cuatro búferes con habilitación en activo bajo: con OE alto la salida queda desconectada (alta impedancia).',
  keywords: ['buffer', 'bufer', 'triestado', 'tri-state', 'tercer estado', 'bus'],
  pins: ['1OE', '1A', '1Y', '2OE', '2A', '2Y', 'GND', '3Y', '3A', '3OE', '4Y', '4A', '4OE', 'VCC'],
  desc: Object.fromEntries([1, 2, 3, 4].flatMap((n) => [[`${n}OE`, `Habilita el búfer ${n} (activo bajo)`], [`${n}A`, `Entrada del búfer ${n}`], [`${n}Y`, `Salida del búfer ${n}`]])),
  ...TTL,
  outputs: ['1Y', '2Y', '3Y', '4Y'],
  init: () => ({}),
  evaluate: (io) => Object.fromEntries([1, 2, 3, 4].map((n) => [`${n}Y`, io.v(`${n}OE`) ? null : io.v(`${n}A`)])),
};

// ── Biestables y latches ────────────────────────────────────────────────────────
const FF = 'Biestables y latches';

const ff74: ChipSpec<{ q: number[] }> = {
  type: '74hc74',
  part: '74HC74',
  name: 'Dos biestables D',
  family: FF,
  description: 'Dos flip-flops D por flanco de subida, con puesta a uno (PRE) y a cero (CLR) en activo bajo.',
  keywords: ['flip flop', 'flipflop', 'biestable', 'tipo d', 'memoria', 'registro', 'secuencial', 'divisor'],
  pins: ['1CLR', '1D', '1CLK', '1PRE', '1Q', '1QN', 'GND', '2QN', '2Q', '2PRE', '2CLK', '2D', '2CLR', 'VCC'],
  desc: Object.fromEntries(
    [1, 2].flatMap((n) => [
      [`${n}CLR`, `Pone Q${n} a 0 al instante (activo bajo)`],
      [`${n}D`, `Dato: se copia en Q${n} con el flanco de subida del reloj`],
      [`${n}CLK`, `Reloj del biestable ${n} (flanco de subida)`],
      [`${n}PRE`, `Pone Q${n} a 1 al instante (activo bajo)`],
      [`${n}Q`, `Salida del biestable ${n}`],
      [`${n}QN`, `Salida invertida del biestable ${n}`],
    ]),
  ),
  ...TTL,
  outputs: ['1Q', '1QN', '2Q', '2QN'],
  init: () => ({ q: [0, 0] }),
  evaluate(io, s) {
    const out: Record<string, Level> = {};
    for (const n of [1, 2]) {
      const clr = !io.v(`${n}CLR`);
      const pre = !io.v(`${n}PRE`);
      if (clr && pre) {
        out[`${n}Q`] = true;
        out[`${n}QN`] = true;
        continue;
      }
      if (clr) s.q[n - 1] = 0;
      else if (pre) s.q[n - 1] = 1;
      else if (io.rise(`${n}CLK`)) s.q[n - 1] = io.v(`${n}D`) ? 1 : 0;
      out[`${n}Q`] = !!s.q[n - 1];
      out[`${n}QN`] = !s.q[n - 1];
    }
    return out;
  },
};

const ff112: ChipSpec<{ q: number[] }> = {
  type: '74hc112',
  part: '74HC112',
  name: 'Dos biestables JK',
  family: FF,
  description: 'Dos flip-flops JK por flanco de bajada: J pone a 1, K a 0, ambos altos alternan.',
  keywords: ['flip flop', 'flipflop', 'biestable', 'jk', 'toggle', 'secuencial', 'divisor', 'contador'],
  pins: ['1CLK', '1K', '1J', '1PRE', '1Q', '1QN', '2QN', 'GND', '2Q', '2PRE', '2J', '2K', '2CLK', '2CLR', '1CLR', 'VCC'],
  desc: Object.fromEntries(
    [1, 2].flatMap((n) => [
      [`${n}CLK`, `Reloj del biestable ${n} (flanco de bajada)`],
      [`${n}J`, `J: con el flanco pone Q${n} a 1`],
      [`${n}K`, `K: con el flanco pone Q${n} a 0`],
      [`${n}PRE`, `Pone Q${n} a 1 al instante (activo bajo)`],
      [`${n}CLR`, `Pone Q${n} a 0 al instante (activo bajo)`],
      [`${n}Q`, `Salida del biestable ${n}`],
      [`${n}QN`, `Salida invertida del biestable ${n}`],
    ]),
  ),
  ...TTL,
  outputs: ['1Q', '1QN', '2Q', '2QN'],
  init: () => ({ q: [0, 0] }),
  evaluate(io, s) {
    const out: Record<string, Level> = {};
    for (const n of [1, 2]) {
      const i = n - 1;
      const clr = !io.v(`${n}CLR`);
      const pre = !io.v(`${n}PRE`);
      if (clr && pre) {
        out[`${n}Q`] = true;
        out[`${n}QN`] = true;
        continue;
      }
      if (clr) s.q[i] = 0;
      else if (pre) s.q[i] = 1;
      else if (io.fall(`${n}CLK`)) {
        const j = io.v(`${n}J`);
        const k = io.v(`${n}K`);
        if (j && k) s.q[i] ^= 1;
        else if (j) s.q[i] = 1;
        else if (k) s.q[i] = 0;
      }
      out[`${n}Q`] = !!s.q[i];
      out[`${n}QN`] = !s.q[i];
    }
    return out;
  },
};

const OCT_D = ['1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D'];
const OCT_Q = ['1Q', '2Q', '3Q', '4Q', '5Q', '6Q', '7Q', '8Q'];
const octDesc = (clock: string): Record<string, string> => ({
  OE: 'Habilita las salidas (activo bajo). Alto: salidas desconectadas',
  ...Object.fromEntries(OCT_D.map((d, i) => [d, `Dato ${i + 1}`])),
  ...Object.fromEntries(OCT_Q.map((q, i) => [q, `Salida ${i + 1}`])),
  [clock === 'LE' ? 'LE' : 'CLK']: clock === 'LE' ? 'Alto: las salidas siguen a los datos. Bajo: se congelan' : 'Reloj: copia los datos en el flanco de subida',
});

const latch373: ChipSpec<{ q: number }> = {
  type: '74hc373',
  part: '74HC373',
  name: 'Latch transparente de 8 bits',
  family: FF,
  description: 'Ocho latches D con salidas triestado. Mientras LE está alto las salidas copian las entradas.',
  keywords: ['latch', 'cerrojo', 'octal', '8 bits', 'memoria', 'bus', 'triestado'],
  pins: ['OE', '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND', 'LE', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC'],
  desc: octDesc('LE'),
  ...TTL,
  outputs: OCT_Q,
  init: () => ({ q: 0 }),
  evaluate(io, s) {
    if (io.v('LE')) s.q = bits(io, OCT_D);
    return outBits(OCT_Q, s.q, io.v('OE') ? null : true);
  },
};

const reg374: ChipSpec<{ q: number }> = {
  ...latch373,
  type: '74hc374',
  part: '74HC374',
  name: 'Registro de 8 biestables D',
  description: 'Ocho flip-flops D con salidas triestado; copian las entradas en el flanco de subida de CLK.',
  keywords: ['registro', 'flip flop', 'octal', '8 bits', 'memoria', 'bus', 'triestado'],
  pins: ['OE', '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND', 'CLK', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC'],
  desc: octDesc('CLK'),
  evaluate(io, s) {
    if (io.rise('CLK')) s.q = bits(io, OCT_D);
    return outBits(OCT_Q, s.q, io.v('OE') ? null : true);
  },
};

const reg273: ChipSpec<{ q: number }> = {
  type: '74hc273',
  part: '74HC273',
  name: 'Registro de 8 bits con borrado',
  family: FF,
  description: 'Ocho flip-flops D con reloj común y borrado general en activo bajo.',
  keywords: ['registro', 'flip flop', 'octal', '8 bits', 'memoria', 'reset'],
  pins: ['MR', 'Q0', 'D0', 'D1', 'Q1', 'Q2', 'D2', 'D3', 'Q3', 'GND', 'CP', 'Q4', 'D4', 'D5', 'Q5', 'Q6', 'D6', 'D7', 'Q7', 'VCC'],
  desc: { MR: 'Borra todas las salidas a 0 (activo bajo)', CP: 'Reloj (flanco de subida)', ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [[`D${i}`, `Dato ${i}`], [`Q${i}`, `Salida ${i}`]])) },
  ...TTL,
  outputs: ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
  init: () => ({ q: 0 }),
  evaluate(io, s) {
    const d = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
    if (!io.v('MR')) s.q = 0;
    else if (io.rise('CP')) s.q = bits(io, d);
    return outBits(['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'], s.q);
  },
};

// ── Registros de desplazamiento ─────────────────────────────────────────────────
const SHIFT = 'Registros de desplazamiento';
const Q8 = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'];

const sr595: ChipSpec<{ sr: number; latch: number }> = {
  type: '74hc595',
  part: '74HC595',
  name: 'Registro de desplazamiento 595',
  family: SHIFT,
  description: 'Entrada serie, 8 salidas en paralelo con latch. El clásico para manejar muchos LEDs con 3 pines del Arduino (shiftOut).',
  keywords: ['shift register', 'registro', 'desplazamiento', 'serie paralelo', 'sipo', 'shiftout', 'expansor', 'salidas', 'leds'],
  pins: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'GND', 'Q7S', 'MR', 'SHCP', 'STCP', 'OE', 'DS', 'Q0', 'VCC'],
  desc: {
    ...Object.fromEntries(Q8.map((q, i) => [q, `Salida paralela ${i}`])),
    Q7S: 'Salida serie: conéctala al DS del siguiente 595 para encadenar',
    MR: 'Borra el registro de desplazamiento (activo bajo). Normalmente a +5 V',
    SHCP: 'Reloj de desplazamiento (SRCLK): cada flanco de subida entra un bit por DS',
    STCP: 'Reloj del latch (RCLK): el flanco de subida pasa el registro a las salidas',
    OE: 'Habilita las salidas (activo bajo). Normalmente a GND',
    DS: 'Entrada de datos serie (SER)',
  },
  ...TTL,
  outputs: [...Q8, 'Q7S'],
  init: () => ({ sr: 0, latch: 0 }),
  evaluate(io, s) {
    const before = s.sr;
    if (!io.v('MR')) s.sr = 0;
    else if (io.rise('SHCP')) s.sr = ((s.sr << 1) | (io.v('DS') ? 1 : 0)) & 0xff;
    // Con los dos relojes unidos, el latch recoge el estado anterior al desplazamiento.
    if (io.rise('STCP')) s.latch = io.rise('SHCP') ? before : s.sr;
    return { ...outBits(Q8, s.latch, io.v('OE') ? null : true), Q7S: !!(s.sr & 0x80) };
  },
};

const sr164: ChipSpec<{ sr: number }> = {
  type: '74hc164',
  part: '74HC164',
  name: 'Registro de desplazamiento 164',
  family: SHIFT,
  description: 'Entrada serie (A·B) y 8 salidas en paralelo, sin latch: las salidas cambian con cada reloj.',
  keywords: ['shift register', 'registro', 'desplazamiento', 'serie paralelo', 'sipo'],
  pins: ['A', 'B', 'Q0', 'Q1', 'Q2', 'Q3', 'GND', 'CP', 'MR', 'Q4', 'Q5', 'Q6', 'Q7', 'VCC'],
  desc: { A: 'Dato serie (se combina con B mediante AND)', B: 'Dato serie (se combina con A mediante AND)', CP: 'Reloj (flanco de subida)', MR: 'Borra todas las salidas (activo bajo)', ...Object.fromEntries(Q8.map((q, i) => [q, `Salida ${i}`])) },
  ...TTL,
  outputs: Q8,
  init: () => ({ sr: 0 }),
  evaluate(io, s) {
    if (!io.v('MR')) s.sr = 0;
    else if (io.rise('CP')) s.sr = ((s.sr << 1) | (io.v('A') && io.v('B') ? 1 : 0)) & 0xff;
    return outBits(Q8, s.sr);
  },
};

const sr165: ChipSpec<{ sr: number; clk: number }> = {
  type: '74hc165',
  part: '74HC165',
  name: 'Registro de desplazamiento 165',
  family: SHIFT,
  description: 'Ocho entradas en paralelo y salida serie. Sirve para leer muchos botones con pocos pines (shiftIn).',
  keywords: ['shift register', 'registro', 'desplazamiento', 'paralelo serie', 'piso', 'shiftin', 'expansor', 'entradas', 'botones'],
  pins: ['PL', 'CP', 'D4', 'D5', 'D6', 'D7', 'Q7N', 'GND', 'Q7', 'DS', 'D0', 'D1', 'D2', 'D3', 'CE', 'VCC'],
  desc: {
    PL: 'Carga las 8 entradas en el registro (activo bajo)',
    CP: 'Reloj de desplazamiento (flanco de subida)',
    CE: 'Inhibe el reloj (activo alto). Normalmente a GND',
    DS: 'Entrada serie: conéctala al Q7 de otro 165 para encadenar',
    Q7: 'Salida serie (último bit)',
    Q7N: 'Salida serie invertida',
    ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`D${i}`, `Entrada paralela ${i}`])),
  },
  ...TTL,
  outputs: ['Q7', 'Q7N'],
  init: () => ({ sr: 0, clk: 0 }),
  evaluate(io, s) {
    const clk = io.v('CP') || io.v('CE') ? 1 : 0;
    if (!io.v('PL')) s.sr = bits(io, ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    else if (clk && !s.clk) s.sr = ((s.sr << 1) | (io.v('DS') ? 1 : 0)) & 0xff;
    s.clk = clk;
    return { Q7: !!(s.sr & 0x80), Q7N: !(s.sr & 0x80) };
  },
};

// ── Contadores ──────────────────────────────────────────────────────────────────
const COUNT = 'Contadores';
const Q4 = ['Q0', 'Q1', 'Q2', 'Q3'];
const D4 = ['D0', 'D1', 'D2', 'D3'];

const counter161 = (sync: boolean): ChipSpec<{ c: number }> => ({
  type: sync ? '74hc163' : '74hc161',
  part: sync ? '74HC163' : '74HC161',
  name: `Contador binario de 4 bits${sync ? ' (borrado síncrono)' : ''}`,
  family: COUNT,
  description: `Cuenta de 0 a 15 con cada flanco de subida, con carga en paralelo y salida de acarreo para encadenar. ${sync ? 'El borrado espera al reloj.' : 'El borrado es inmediato.'}`,
  keywords: ['contador', 'counter', 'binario', '4 bits', 'divisor', 'secuencial', 'hexadecimal'],
  pins: ['MR', 'CP', 'D0', 'D1', 'D2', 'D3', 'CEP', 'GND', 'PE', 'CET', 'Q3', 'Q2', 'Q1', 'Q0', 'TC', 'VCC'],
  desc: {
    MR: `Pone la cuenta a 0 (activo bajo${sync ? ', en el siguiente flanco' : ''})`,
    CP: 'Reloj (flanco de subida)',
    CEP: 'Habilita la cuenta (con CET)',
    CET: 'Habilita la cuenta y la salida TC',
    PE: 'Carga D0–D3 en el siguiente flanco (activo bajo)',
    TC: 'Acarreo: alto al llegar a 15. Va al CET del siguiente contador',
    ...Object.fromEntries(Q4.map((q, i) => [q, `Bit ${i} de la cuenta (vale ${1 << i})`])),
    ...Object.fromEntries(D4.map((d, i) => [d, `Bit ${i} del valor a cargar`])),
  },
  ...TTL,
  outputs: [...Q4, 'TC'],
  init: () => ({ c: 0 }),
  evaluate(io, s) {
    if (!sync && !io.v('MR')) s.c = 0;
    else if (io.rise('CP')) {
      if (sync && !io.v('MR')) s.c = 0;
      else if (!io.v('PE')) s.c = bits(io, D4);
      else if (io.v('CEP') && io.v('CET')) s.c = (s.c + 1) & 15;
    }
    return { ...outBits(Q4, s.c), TC: io.v('CET') && s.c === 15 };
  },
});

const counter193: ChipSpec<{ c: number }> = {
  type: '74hc193',
  part: '74HC193',
  name: 'Contador ascendente/descendente',
  family: COUNT,
  description: 'Contador binario de 4 bits con un reloj para subir y otro para bajar, carga en paralelo y salidas de desbordamiento.',
  keywords: ['contador', 'counter', 'up down', 'ascendente', 'descendente', 'reversible', '4 bits'],
  pins: ['D1', 'Q1', 'Q0', 'CPD', 'CPU', 'Q2', 'Q3', 'GND', 'D3', 'D2', 'PL', 'TCU', 'TCD', 'MR', 'D0', 'VCC'],
  desc: {
    CPU: 'Reloj de subida: suma 1 en el flanco de subida (CPD debe estar alto)',
    CPD: 'Reloj de bajada: resta 1 en el flanco de subida (CPU debe estar alto)',
    PL: 'Carga D0–D3 al instante (activo bajo)',
    MR: 'Pone la cuenta a 0 (activo alto)',
    TCU: 'Baja al pasar de 15 a 0 (acarreo)',
    TCD: 'Baja al pasar de 0 a 15 (préstamo)',
    ...Object.fromEntries(Q4.map((q, i) => [q, `Bit ${i} de la cuenta`])),
    ...Object.fromEntries(D4.map((d, i) => [d, `Bit ${i} del valor a cargar`])),
  },
  ...TTL,
  outputs: [...Q4, 'TCU', 'TCD'],
  init: () => ({ c: 0 }),
  evaluate(io, s) {
    if (io.v('MR')) s.c = 0;
    else if (!io.v('PL')) s.c = bits(io, D4);
    else if (io.rise('CPU') && io.v('CPD')) s.c = (s.c + 1) & 15;
    else if (io.rise('CPD') && io.v('CPU')) s.c = (s.c + 15) & 15;
    return { ...outBits(Q4, s.c), TCU: !(s.c === 15 && !io.v('CPU')), TCD: !(s.c === 0 && !io.v('CPD')) };
  },
};

const DEC = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9'];
const johnson4017: ChipSpec<{ c: number }> = {
  type: 'cd4017',
  part: 'CD4017',
  name: 'Contador decimal 4017',
  family: COUNT,
  description: 'Diez salidas que se encienden de una en una con cada pulso de reloj. Perfecto para secuencias de LEDs con un 555.',
  keywords: ['contador', 'decada', 'decimal', 'johnson', 'secuenciador', 'leds', 'luces', 'knight rider', 'cmos'],
  pins: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLK', 'RST', 'VDD'],
  desc: {
    ...Object.fromEntries(DEC.map((q, i) => [q, `Alta cuando la cuenta vale ${i}`])),
    CO: 'Acarreo: alta en las cuentas 0–4. Va al CLK del siguiente 4017',
    INH: 'Detiene la cuenta (activo alto). Normalmente a GND',
    CLK: 'Reloj: avanza una salida en cada flanco de subida',
    RST: 'Vuelve a Q0 (activo alto). Normalmente a GND',
  },
  ...CMOS,
  outputs: [...DEC, 'CO'],
  init: () => ({ c: 0 }),
  evaluate(io, s) {
    if (io.v('RST')) s.c = 0;
    else if (io.rise('CLK') && !io.v('INH')) s.c = (s.c + 1) % 10;
    return { ...Object.fromEntries(DEC.map((q, i) => [q, s.c === i])), CO: s.c < 5 };
  },
};

const Q12 = Array.from({ length: 12 }, (_, i) => `Q${i + 1}`);
const ripple4040: ChipSpec<{ c: number }> = {
  type: 'cd4040',
  part: 'CD4040',
  name: 'Contador binario de 12 bits',
  family: COUNT,
  description: 'Contador de rizado de 12 etapas: cada salida divide la frecuencia del reloj entre 2, 4, 8… hasta 4096.',
  keywords: ['contador', 'binario', '12 bits', 'divisor de frecuencia', 'ripple', 'prescaler', 'cmos'],
  pins: ['Q12', 'Q6', 'Q5', 'Q7', 'Q4', 'Q3', 'Q2', 'VSS', 'Q1', 'CLK', 'RST', 'Q9', 'Q8', 'Q10', 'Q11', 'VDD'],
  desc: { ...Object.fromEntries(Q12.map((q, i) => [q, `Bit ${i}: frecuencia del reloj ÷ ${2 ** (i + 1)}`])), CLK: 'Reloj (cuenta en el flanco de bajada)', RST: 'Pone la cuenta a 0 (activo alto)' },
  ...CMOS,
  outputs: Q12,
  init: () => ({ c: 0 }),
  evaluate(io, s) {
    if (io.v('RST')) s.c = 0;
    else if (io.fall('CLK')) s.c = (s.c + 1) & 4095;
    return outBits(Q12, s.c);
  },
};

// ── Decodificadores, multiplexores y aritmética ─────────────────────────────────
const COMB = 'Decodificadores y multiplexores';
const ARITH = 'Aritmética';

const Y8 = ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7'];
const dec138: ChipSpec<Record<string, never>> = {
  type: '74hc138',
  part: '74HC138',
  name: 'Decodificador 3 a 8',
  family: COMB,
  description: 'Según el número binario en A0–A2, baja una de las ocho salidas. Útil para seleccionar chips o filas.',
  keywords: ['decodificador', 'decoder', 'demultiplexor', 'demux', '3 a 8', 'selector', 'direcciones'],
  pins: ['A0', 'A1', 'A2', 'E1', 'E2', 'E3', 'Y7', 'GND', 'Y6', 'Y5', 'Y4', 'Y3', 'Y2', 'Y1', 'Y0', 'VCC'],
  desc: {
    A0: 'Dirección, bit 0',
    A1: 'Dirección, bit 1',
    A2: 'Dirección, bit 2',
    E1: 'Habilitación (activo bajo)',
    E2: 'Habilitación (activo bajo)',
    E3: 'Habilitación (activo alto)',
    ...Object.fromEntries(Y8.map((y, i) => [y, `Baja cuando la dirección vale ${i}`])),
  },
  ...TTL,
  outputs: Y8,
  init: () => ({}),
  evaluate(io) {
    const on = !io.v('E1') && !io.v('E2') && io.v('E3');
    const sel = bits(io, ['A0', 'A1', 'A2']);
    return Object.fromEntries(Y8.map((y, i) => [y, !(on && sel === i)]));
  },
};

const dec139: ChipSpec<Record<string, never>> = {
  type: '74hc139',
  part: '74HC139',
  name: 'Dos decodificadores 2 a 4',
  family: COMB,
  description: 'Dos decodificadores independientes: cada uno baja una de cuatro salidas según dos bits.',
  keywords: ['decodificador', 'decoder', 'demultiplexor', 'demux', '2 a 4', 'selector'],
  pins: ['1E', '1A0', '1A1', '1Y0', '1Y1', '1Y2', '1Y3', 'GND', '2Y3', '2Y2', '2Y1', '2Y0', '2A1', '2A0', '2E', 'VCC'],
  desc: Object.fromEntries(
    [1, 2].flatMap((n) => [[`${n}E`, `Habilita el decodificador ${n} (activo bajo)`], [`${n}A0`, 'Dirección, bit 0'], [`${n}A1`, 'Dirección, bit 1'], ...[0, 1, 2, 3].map((i) => [`${n}Y${i}`, `Baja cuando la dirección vale ${i}`])]),
  ),
  ...TTL,
  outputs: ['1Y0', '1Y1', '1Y2', '1Y3', '2Y0', '2Y1', '2Y2', '2Y3'],
  init: () => ({}),
  evaluate(io) {
    const out: Record<string, Level> = {};
    for (const n of [1, 2]) {
      const sel = bits(io, [`${n}A0`, `${n}A1`]);
      for (let i = 0; i < 4; i++) out[`${n}Y${i}`] = !(!io.v(`${n}E`) && sel === i);
    }
    return out;
  },
};

const mux151: ChipSpec<Record<string, never>> = {
  type: '74hc151',
  part: '74HC151',
  name: 'Multiplexor 8 a 1',
  family: COMB,
  description: 'Elige una de ocho entradas con S0–S2 y la lleva a la salida Y.',
  keywords: ['multiplexor', 'mux', 'selector', '8 a 1', 'conmutador digital'],
  pins: ['I3', 'I2', 'I1', 'I0', 'Y', 'YN', 'E', 'GND', 'S2', 'S1', 'S0', 'I7', 'I6', 'I5', 'I4', 'VCC'],
  desc: { Y: 'Salida: copia la entrada elegida', YN: 'Salida invertida', E: 'Habilitación (activo bajo)', S0: 'Selección, bit 0', S1: 'Selección, bit 1', S2: 'Selección, bit 2', ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`I${i}`, `Entrada ${i}`])) },
  ...TTL,
  outputs: ['Y', 'YN'],
  init: () => ({}),
  evaluate(io) {
    if (io.v('E')) return { Y: false, YN: true };
    const y = io.v(`I${bits(io, ['S0', 'S1', 'S2'])}`);
    return { Y: y, YN: !y };
  },
};

const mux157: ChipSpec<Record<string, never>> = {
  type: '74hc157',
  part: '74HC157',
  name: 'Cuatro multiplexores 2 a 1',
  family: COMB,
  description: 'Cuatro selectores de dos entradas con una sola línea de selección S.',
  keywords: ['multiplexor', 'mux', 'selector', '2 a 1', 'quad'],
  pins: ['S', '1I0', '1I1', '1Y', '2I0', '2I1', '2Y', 'GND', '3Y', '3I1', '3I0', '4Y', '4I1', '4I0', 'E', 'VCC'],
  desc: { S: 'Selección: bajo elige I0, alto elige I1', E: 'Habilitación (activo bajo)', ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => [[`${n}I0`, `Entrada 0 del selector ${n}`], [`${n}I1`, `Entrada 1 del selector ${n}`], [`${n}Y`, `Salida del selector ${n}`]])) },
  ...TTL,
  outputs: ['1Y', '2Y', '3Y', '4Y'],
  init: () => ({}),
  evaluate: (io) => Object.fromEntries([1, 2, 3, 4].map((n) => [`${n}Y`, !io.v('E') && io.v(`${n}I${io.v('S') ? 1 : 0}`)])),
};

const adder283: ChipSpec<Record<string, never>> = {
  type: '74hc283',
  part: '74HC283',
  name: 'Sumador binario de 4 bits',
  family: ARITH,
  description: 'Suma dos números de 4 bits más un acarreo de entrada. Encadena varios para sumar más bits.',
  keywords: ['sumador', 'adder', 'suma', 'full adder', 'aritmetica', 'alu', '4 bits'],
  pins: ['S1', 'B1', 'A1', 'S0', 'A0', 'B0', 'CIN', 'GND', 'COUT', 'S3', 'B3', 'A3', 'S2', 'A2', 'B2', 'VCC'],
  desc: {
    CIN: 'Acarreo de entrada',
    COUT: 'Acarreo de salida (la suma pasó de 15)',
    ...Object.fromEntries([0, 1, 2, 3].flatMap((i) => [[`A${i}`, `Número A, bit ${i}`], [`B${i}`, `Número B, bit ${i}`], [`S${i}`, `Suma, bit ${i}`]])),
  },
  ...TTL,
  outputs: ['S0', 'S1', 'S2', 'S3', 'COUT'],
  init: () => ({}),
  evaluate(io) {
    const sum = bits(io, ['A0', 'A1', 'A2', 'A3']) + bits(io, ['B0', 'B1', 'B2', 'B3']) + (io.v('CIN') ? 1 : 0);
    return { ...outBits(['S0', 'S1', 'S2', 'S3'], sum), COUT: sum > 15 };
  },
};

const comp85: ChipSpec<Record<string, never>> = {
  type: '74hc85',
  part: '74HC85',
  name: 'Comparador de 4 bits',
  family: ARITH,
  description: 'Compara dos números de 4 bits e indica si A es mayor, igual o menor que B.',
  keywords: ['comparador', 'comparator', 'mayor', 'menor', 'igual', 'magnitud', 'aritmetica'],
  pins: ['B3', 'IALTB', 'IAEQB', 'IAGTB', 'OAGTB', 'OAEQB', 'OALTB', 'GND', 'B0', 'A0', 'B1', 'A1', 'A2', 'B2', 'A3', 'VCC'],
  desc: {
    IALTB: 'Entrada de cascada A<B (a GND si no encadenas)',
    IAEQB: 'Entrada de cascada A=B (a +5 V si no encadenas)',
    IAGTB: 'Entrada de cascada A>B (a GND si no encadenas)',
    OAGTB: 'Alta si A > B',
    OAEQB: 'Alta si A = B',
    OALTB: 'Alta si A < B',
    ...Object.fromEntries([0, 1, 2, 3].flatMap((i) => [[`A${i}`, `Número A, bit ${i}`], [`B${i}`, `Número B, bit ${i}`]])),
  },
  ...TTL,
  outputs: ['OAGTB', 'OAEQB', 'OALTB'],
  init: () => ({}),
  evaluate(io) {
    const a = bits(io, ['A0', 'A1', 'A2', 'A3']);
    const b = bits(io, ['B0', 'B1', 'B2', 'B3']);
    if (a !== b) return { OAGTB: a > b, OAEQB: false, OALTB: a < b };
    if (io.v('IAEQB')) return { OAGTB: false, OAEQB: true, OALTB: false };
    return { OAGTB: io.v('IAGTB') && !io.v('IALTB'), OAEQB: false, OALTB: io.v('IALTB') && !io.v('IAGTB') };
  },
};

// Segmentos por dígito (a–g) al estilo del 4511: el 6 y el 9 sin colas.
const SEGMENTS = [0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110, 0b1101101, 0b1111100, 0b0000111, 0b1111111, 0b1100111];
const SEG = ['SA', 'SB', 'SC', 'SD', 'SE', 'SF', 'SG'];
const segDesc = (activeLow: boolean) =>
  Object.fromEntries(SEG.map((s) => [s, `Segmento ${s[1].toLowerCase()} del display${activeLow ? ' (baja para encender; display de ánodo común)' : ' (display de cátodo común)'}`]));

const bcd4511: ChipSpec<{ latch: number }> = {
  type: 'cd4511',
  part: 'CD4511',
  name: 'Decodificador BCD a 7 segmentos',
  family: COMB,
  description: 'Convierte un número BCD (0–9) en los siete segmentos de un display de cátodo común, con latch.',
  keywords: ['bcd', '7 segmentos', 'siete segmentos', 'display', 'decodificador', 'driver', 'numero', 'cmos'],
  pins: ['B', 'C', 'LT', 'BL', 'LE', 'D', 'A', 'VSS', 'SE', 'SD', 'SC', 'SB', 'SA', 'SG', 'SF', 'VDD'],
  desc: { A: 'BCD, bit 0 (vale 1)', B: 'BCD, bit 1 (vale 2)', C: 'BCD, bit 2 (vale 4)', D: 'BCD, bit 3 (vale 8)', LT: 'Prueba: enciende todos los segmentos (activo bajo). Normalmente a +5 V', BL: 'Apaga el display (activo bajo). Normalmente a +5 V', LE: 'Alto: congela el número mostrado. Normalmente a GND', ...segDesc(false) },
  ...CMOS,
  outputs: SEG,
  init: () => ({ latch: 0 }),
  evaluate(io, s) {
    if (!io.v('LE')) s.latch = bits(io, ['A', 'B', 'C', 'D']);
    const pattern = !io.v('LT') ? 0x7f : !io.v('BL') ? 0 : (SEGMENTS[s.latch] ?? 0);
    return outBits(SEG, pattern);
  },
};

const bcd47: ChipSpec<Record<string, never>> = {
  type: '74ls47',
  part: '74LS47',
  name: 'Decodificador BCD a 7 segmentos (ánodo común)',
  family: COMB,
  description: 'Como el 4511 pero con salidas de colector abierto que bajan para encender: para displays de ánodo común.',
  keywords: ['bcd', '7 segmentos', 'siete segmentos', 'display', 'decodificador', 'anodo comun', 'colector abierto', '7447'],
  pins: ['B', 'C', 'LT', 'BIRBO', 'RBI', 'D', 'A', 'GND', 'SE', 'SD', 'SC', 'SB', 'SA', 'SG', 'SF', 'VCC'],
  desc: { A: 'BCD, bit 0 (vale 1)', B: 'BCD, bit 1 (vale 2)', C: 'BCD, bit 2 (vale 4)', D: 'BCD, bit 3 (vale 8)', LT: 'Prueba de lámpara (activo bajo)', BIRBO: 'Apagado del display (activo bajo)', RBI: 'Borra los ceros a la izquierda (activo bajo)', ...segDesc(true) },
  ...TTL,
  openDrain: true,
  outputs: SEG,
  init: () => ({}),
  evaluate(io) {
    const n = bits(io, ['A', 'B', 'C', 'D']);
    const pattern = !io.v('LT') ? 0x7f : !io.v('BIRBO') || (n === 0 && !io.v('RBI')) ? 0 : (SEGMENTS[n] ?? 0);
    return Object.fromEntries(SEG.map((sg, i) => [sg, (pattern >> i) & 1 ? false : null]));
  },
};

// ── Controladores y temporizadores ──────────────────────────────────────────────
const DRIVERS = 'Controladores y temporizadores';

const switch4066: ChipSpec<Record<string, never>> = {
  type: 'cd4066',
  part: 'CD4066',
  name: 'Cuatro interruptores analógicos',
  family: DRIVERS,
  description: 'Cuatro interruptores bidireccionales controlados por tensión: con el control alto conectan sus dos patillas (≈80 Ω).',
  keywords: ['interruptor analogico', 'analog switch', 'conmutador', 'bilateral', 'transmission gate', 'cmos', '4066'],
  pins: ['1Y', '1Z', '2Z', '2Y', '2E', '3E', 'VSS', '3Y', '3Z', '4Z', '4Y', '4E', '1E', 'VDD'],
  desc: Object.fromEntries([1, 2, 3, 4].flatMap((n) => [[`${n}Y`, `Interruptor ${n}, un extremo`], [`${n}Z`, `Interruptor ${n}, el otro extremo`], [`${n}E`, `Control del interruptor ${n}: alto = cerrado`]])),
  ...CMOS,
  outputs: [],
  init: () => ({}),
  evaluate: () => ({}),
  extra: (net, _levels, io) =>
    [1, 2, 3, 4].map((n) => new Resistor(net(`${n}Y`), net(`${n}Z`), () => (io()?.v(`${n}E`) ? 80 : 1e9))),
};

const uln2003: ChipSpec<Record<string, never>> = {
  type: 'uln2003',
  part: 'ULN2003A',
  name: 'Siete drivers Darlington',
  family: DRIVERS,
  description: 'Siete transistores que conectan su salida a tierra cuando la entrada sube. Para relés, motores paso a paso y cargas de hasta 500 mA.',
  keywords: ['darlington', 'driver', 'motor paso a paso', 'stepper', '28byj-48', 'rele', 'transistor', 'colector abierto', 'uln2003'],
  pins: ['1B', '2B', '3B', '4B', '5B', '6B', '7B', 'GND', 'COM', '7C', '6C', '5C', '4C', '3C', '2C', '1C'],
  desc: {
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].flatMap((n) => [[`${n}B`, `Entrada ${n}: alta = salida ${n} conectada a tierra`], [`${n}C`, `Salida ${n}: hacia la carga (conecta el otro lado de la carga al positivo)`]])),
    COM: 'Diodos de protección: conéctalo al positivo de la carga (bobinas)',
    GND: 'Tierra (común con el Arduino)',
  },
  vcc: null,
  gnd: 'GND',
  openDrain: true,
  outputs: ['1C', '2C', '3C', '4C', '5C', '6C', '7C'],
  init: () => ({}),
  evaluate: (io) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`${n}C`, io.v(`${n}B`) ? false : null])),
  extra: (net) => [1, 2, 3, 4, 5, 6, 7].map((n) => new Diode(net(`${n}C`), net('COM'), 1e-12, 1.8)),
};

const l293d: ChipSpec<Record<string, never>> = {
  type: 'l293d',
  part: 'L293D',
  name: 'Puente H doble L293D',
  family: DRIVERS,
  description: 'Cuatro medios puentes para mover dos motores de continua en ambos sentidos. VS alimenta los motores; VCC, la lógica.',
  keywords: ['puente h', 'h bridge', 'motor', 'driver', 'controlador de motor', 'dc', 'stepper', 'l293', 'sn754410'],
  pins: ['EN12', '1A', '1Y', 'GND', 'GND', '2Y', '2A', 'VS', 'EN34', '3A', '3Y', 'GND', 'GND', '4Y', '4A', 'VCC'],
  desc: {
    EN12: 'Habilita las salidas 1 y 2 (alto = activas; con PWM regula la velocidad)',
    EN34: 'Habilita las salidas 3 y 4',
    VS: 'Alimentación de los motores (4,5–36 V)',
    VCC: 'Alimentación de la lógica (+5 V)',
    GND: 'Tierra y disipador',
    ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => [[`${n}A`, `Entrada ${n}: la salida ${n} copia este nivel`], [`${n}Y`, `Salida ${n} hacia el motor`]])),
  },
  vcc: 'VCC',
  gnd: 'GND',
  rail: 'VS',
  outputs: ['1Y', '2Y', '3Y', '4Y'],
  init: () => ({}),
  evaluate: (io) => Object.fromEntries([1, 2, 3, 4].map((n) => [`${n}Y`, io.v(n < 3 ? 'EN12' : 'EN34') ? io.v(`${n}A`) : null])),
  extra: (net) => [1, 2, 3, 4].flatMap((n) => [new Diode(net(`${n}Y`), net('VS'), 1e-12, 1.8), new Diode(net('GND'), net(`${n}Y`), 1e-12, 1.8)]),
};

// ── 555 ─────────────────────────────────────────────────────────────────────────
// Divisor interno de 3 × 5 kΩ, dos comparadores y un biestable. El temporizador pide pasos
// de 20 µs mientras está alimentado para seguir la carga del condensador externo.
const ne555Def: PartDef = (() => {
  const spec: ChipSpec<Record<string, never>> = {
    type: 'ne555',
    part: 'NE555',
    name: 'Temporizador 555',
    family: DRIVERS,
    description: 'El temporizador más popular: genera pulsos (monoestable) u oscila solo (astable) con dos resistencias y un condensador.',
    keywords: ['555', 'timer', 'temporizador', 'oscilador', 'astable', 'monoestable', 'reloj', 'parpadeo', 'pwm', 'lm555'],
    pins: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'],
    desc: {
      GND: 'Tierra',
      TRIG: 'Disparo: si baja de 1/3 de VCC, la salida sube',
      OUT: 'Salida (hasta 200 mA)',
      RESET: 'Apaga la salida (activo bajo). Normalmente a VCC',
      CTRL: 'Tensión de control (2/3 de VCC). Normalmente a GND con 10 nF',
      THR: 'Umbral: si supera 2/3 de VCC, la salida baja',
      DIS: 'Descarga: se conecta a tierra cuando la salida está baja',
      VCC: 'Alimentación (4,5–16 V)',
    },
    vcc: 'VCC',
    gnd: 'GND',
    outputs: ['OUT'],
    init: () => ({}),
    evaluate: () => ({}),
  };
  const base = chipDef(spec);
  return {
    ...base,
    category: 'Integrados',
    sim(ctx) {
      const gnd = ctx.net('GND');
      const vcc = ctx.net('VCC');
      const ctrl = ctx.net('CTRL');
      const low = ctx.node();
      let q = false;
      let t = 0;
      let dirty = false;
      let powered = false;
      // Próxima comprobación de los comparadores. Lejos del umbral se estima con la pendiente
      // del condensador cuándo llegará; cerca, cada 20 µs. Así un astable lento no obliga a
      // resolver todo el circuito 50 000 veces por segundo.
      let wait = 2e-5;
      let lastSense: number | null = null;
      const elements: Element[] = [
        new Resistor(vcc, ctrl, () => 5000),
        new Resistor(ctrl, low, () => 5000),
        new Resistor(low, gnd, () => 5000),
        new Resistor(ctx.net('OUT'), vcc, () => (powered && q ? 12 : R_OFF)),
        new Resistor(ctx.net('OUT'), gnd, () => (powered && !q ? 8 : R_OFF)),
        new Resistor(ctx.net('DIS'), gnd, () => (powered && !q ? 8 : R_OFF)),
        new Resistor(ctx.net('TRIG'), gnd, () => 10_000_000),
        new Resistor(ctx.net('THR'), gnd, () => 10_000_000),
        new Resistor(ctx.net('RESET'), vcc, () => 100_000),
      ];
      const at = (v: Float64Array, n: number) => (n < 0 ? 0 : v[n]);
      return {
        elements,
        changed: () => {
          const d = dirty;
          dirty = false;
          return d;
        },
        nextEvent: () => (powered ? t + wait : null),
        tracker: {
          sample(v: Float64Array, dt: number) {
            t += dt;
            const ref = at(v, gnd);
            const on = at(v, vcc) - ref > 3;
            if (on !== powered) {
              powered = on;
              dirty = true;
            }
            if (!on) {
              if (q) q = false;
              return;
            }
            let next = q;
            if (at(v, ctx.net('RESET')) - ref < 0.7) next = false;
            else if (at(v, ctx.net('TRIG')) < at(v, low)) next = true;
            else if (at(v, ctx.net('THR')) > at(v, ctrl)) next = false;
            if (next !== q) {
              q = next;
              dirty = true;
              lastSense = null;
              wait = 2e-5;
              return;
            }
            // Con la salida alta el condensador sube hacia el umbral alto (THR); con la salida
            // baja descarga hacia el umbral bajo (TRIG).
            const sense = q ? at(v, ctx.net('THR')) : at(v, ctx.net('TRIG'));
            const goal = q ? at(v, ctrl) : at(v, low);
            const slope = lastSense === null || dt <= 0 ? 0 : (sense - lastSense) / dt;
            lastSense = sense;
            const eta = slope !== 0 && Math.sign(goal - sense) === Math.sign(slope) ? (goal - sense) / slope : Infinity;
            // La carga y la descarga son exponenciales: frenan al acercarse, así que la
            // extrapolación lineal siempre llega antes que el cruce real. Se puede usar entera.
            wait = Math.min(4e-3, Math.max(2e-5, eta * 0.95));
          },
          read: () => ({ on: q }),
        },
      };
    },
  };
})();

// ── Catálogo ────────────────────────────────────────────────────────────────────
// Legacy packages in the course diagrams. TTL thresholds do not apply to HC parts.
const LEGACY = { ...TTL, inputThresholds: { low: 0.8, high: 2 }, minSupply: 4.5 };
function jk73(edgeTriggered: boolean): ChipSpec<{ q: number[]; master: number[] }> {
  return {
    type: edgeTriggered ? '74ls73a' : '7473',
    part: edgeTriggered ? '74LS73A' : '7473',
    name: edgeTriggered ? 'Dos biestables JK por flanco' : 'Dos biestables JK maestro-esclavo',
    family: FF,
    description: edgeTriggered
      ? 'JK por flanco de bajada, con borrado asíncrono activo bajo. Patillaje DIP-14 de la familia 73.'
      : 'JK maestro-esclavo: captura durante el nivel alto y transfiere al bajar el reloj. Mantén J/K estables durante el pulso alto. VCC en patilla 4 y GND en 11.',
    keywords: [edgeTriggered ? 'sn74ls73a' : 'sn7473', 'jk', 'flip flop', 'contador', 'gtx', 'reset', 'secuencial'],
    pins: ['1CLK', '1CLR', '1K', 'VCC', '2CLK', '2CLR', '2J', '2QN', '2Q', '2K', 'GND', '1QN', '1Q', '1J'],
    desc: Object.fromEntries([1, 2].flatMap((n) => [
      [`${n}CLK`, edgeTriggered ? 'Reloj: flanco de bajada' : 'Captura J/K en alto; transfiere Q al bajar'],
      [`${n}CLR`, 'Borrado asíncrono activo bajo; fuerza Q a 0'],
      [`${n}J`, 'J: pone a uno; con K alto alterna'], [`${n}K`, 'K: pone a cero; con J alto alterna'],
      [`${n}Q`, `Salida Q del biestable ${n}`], [`${n}QN`, `Salida complementaria del biestable ${n}`],
    ])),
    ...LEGACY,
    outputs: ['1Q', '1QN', '2Q', '2QN'],
    init: () => ({ q: [0, 0], master: [0, 0] }),
    evaluate(io, state) {
      const out: Record<string, Level> = {};
      for (const n of [1, 2]) {
        const i = n - 1;
        const next = () => io.v(`${n}J`) ? (io.v(`${n}K`) ? state.q[i] ^ 1 : 1) : (io.v(`${n}K`) ? 0 : state.q[i]);
        if (!io.v(`${n}CLR`)) state.q[i] = state.master[i] = 0;
        else if (edgeTriggered) { if (io.fall(`${n}CLK`)) state.q[i] = next(); }
        else {
          if (io.v(`${n}CLK`)) state.master[i] = next();
          if (io.fall(`${n}CLK`)) state.q[i] = state.master[i];
        }
        out[`${n}Q`] = Boolean(state.q[i]);
        out[`${n}QN`] = !state.q[i];
      }
      return out;
    },
  };
}
const latch75: ChipSpec<{ q: number[] }> = {
  type: '7475', part: '7475', name: 'Memoria de 4 latches D', family: FF,
  description: 'Cuatro latches transparentes con Q y Q invertida. LE12 controla bits 1–2 y LE34 bits 3–4. VCC en patilla 5 y GND en 12.',
  keywords: ['sn7475', 'memoria', 'latch', '4 bits', 'gtx', 'tx', 'rx', 'enable'],
  pins: ['1QN', '1D', '2D', 'LE34', 'VCC', '3D', '4D', '4QN', '4Q', '3Q', '3QN', 'GND', 'LE12', '2QN', '2Q', '1Q'],
  desc: {
    LE12: 'Habilitación activa alta de los latches 1 y 2. Bajo: retiene sus datos',
    LE34: 'Habilitación activa alta de los latches 3 y 4. Bajo: retiene sus datos',
    ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => [
      [`${n}D`, `Entrada de dato del latch ${n}`], [`${n}Q`, `Dato almacenado del latch ${n}`], [`${n}QN`, `Complemento del dato del latch ${n}`],
    ])),
  },
  ...LEGACY, outputs: [1, 2, 3, 4].flatMap((n) => [`${n}Q`, `${n}QN`]),
  init: () => ({ q: [0, 0, 0, 0] }),
  evaluate(io, state) {
    const out: Record<string, Level> = {};
    for (const n of [1, 2, 3, 4]) {
      if (io.v(n <= 2 ? 'LE12' : 'LE34')) state.q[n - 1] = Number(io.v(`${n}D`));
      out[`${n}Q`] = Boolean(state.q[n - 1]); out[`${n}QN`] = !state.q[n - 1];
    }
    return out;
  },
};
const mux153: ChipSpec<Record<string, never>> = {
  type: '74153', part: '74153', name: 'Dos multiplexores 4 a 1', family: COMB,
  description: 'Dos multiplexores de cuatro entradas comparten A/B. Cada canal tiene habilitación G activa baja; deshabilitado fuerza su salida a cero.',
  keywords: ['sn74153', 'mux', 'multiplexor', '4 a 1', 'selector', 'gtx'],
  pins: ['1G', 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0', '2C1', '2C2', '2C3', 'A', '2G', 'VCC'],
  desc: { A: 'Selección compartida, bit menos significativo', B: 'Selección compartida, bit más significativo',
    ...Object.fromEntries([1, 2].flatMap((n) => [
      [`${n}G`, `Habilitación del canal ${n}, activa baja. Alto: salida a cero`], [`${n}Y`, `Salida del canal ${n}`],
      ...[0, 1, 2, 3].map((i) => [`${n}C${i}`, `Dato ${i} del canal ${n}`]),
    ])),
  },
  ...LEGACY, outputs: ['1Y', '2Y'], init: () => ({}),
  evaluate(io) {
    const selected = bits(io, ['A', 'B']);
    return { '1Y': !io.v('1G') && io.v(`1C${selected}`), '2Y': !io.v('2G') && io.v(`2C${selected}`) };
  },
};
const encoder148: ChipSpec<Record<string, never>> = {
  type: '74hc148', part: '74HC148', name: 'Codificador prioritario 8 a 3', family: COMB,
  description: 'Entradas y salidas activas bajas. La entrada de mayor índice tiene prioridad. EI habilita; GS indica un dato válido y EO permite cascada.',
  keywords: ['encoder', 'codificador', 'prioridad', '8 a 3', 'ascensor', 'teclado'],
  pins: ['I4', 'I5', 'I6', 'I7', 'EI', 'A2', 'A1', 'GND', 'A0', 'I0', 'I1', 'I2', 'I3', 'GS', 'EO', 'VCC'],
  desc: { EI: 'Habilitación activa baja', EO: 'Baja si está habilitado y no hay ninguna entrada activa', GS: 'Baja si hay una entrada activa y está habilitado',
    ...Object.fromEntries([0, 1, 2].map((i) => [`A${i}`, `Bit ${i} del código binario invertido`])),
    ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`I${i}`, `Entrada ${i}, activa baja. Mayor índice: mayor prioridad`])),
  },
  ...TTL, outputs: ['A0', 'A1', 'A2', 'GS', 'EO'], init: () => ({}),
  evaluate(io) {
    let selected = -1;
    if (!io.v('EI')) for (let i = 0; i < 8; i++) if (!io.v(`I${i}`)) selected = i;
    return { ...outBits(['A0', 'A1', 'A2'], selected < 0 ? 7 : (~selected & 7)), GS: selected < 0, EO: io.v('EI') || selected >= 0 };
  },
};

export const CHIPS: PartDef[] = [
  ...gateChips.map((spec) => chipDef(spec)),
  chipDef(buffer125),
  ...cmosGates.map((spec) => chipDef(spec)),
  chipDef(jk73(false)),
  chipDef(jk73(true)),
  chipDef(latch75),
  chipDef({ ...latch75, type: '74ls75', part: '74LS75', keywords: ['sn74ls75', ...latch75.keywords] }),
  chipDef(mux153),
  chipDef({ ...mux153, type: '74hc153', part: '74HC153', inputThresholds: undefined, minSupply: undefined }),
  chipDef({ ...mux153, type: '74ls153', part: '74LS153' }),
  chipDef({ ...dec138, ...LEGACY, type: '74138', part: '74138' }),
  chipDef({ ...dec138, ...LEGACY, type: '74ls138', part: '74LS138' }),
  chipDef(encoder148),
  chipDef({ ...encoder148, ...LEGACY, type: '74148', part: '74148' }),
  chipDef(ff74),
  chipDef(ff112),
  chipDef(latch373),
  chipDef(reg374),
  chipDef(reg273),
  chipDef(sr595),
  chipDef(sr164),
  chipDef(sr165),
  chipDef(counter161(false)),
  chipDef(counter161(true)),
  chipDef(counter193),
  chipDef(johnson4017),
  chipDef(ripple4040),
  chipDef(dec138),
  chipDef(dec139),
  chipDef(mux151),
  chipDef(mux157),
  chipDef(bcd4511),
  chipDef(bcd47),
  chipDef(adder283),
  chipDef(comp85),
  chipDef(switch4066),
  chipDef(uln2003),
  chipDef(l293d),
  ne555Def,
];

export type { Props };
