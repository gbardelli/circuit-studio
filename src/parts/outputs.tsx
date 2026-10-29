import { memo } from 'react';
import { Diode, Resistor, VT } from '../core/solver';
import { formatSI } from '../core/units';
import type { PartDef, RenderProps, Visual } from './types';
import { Glow, Leg, WarningBadge, ledIntensity } from './common';

// Tensión directa a 20 mA y color de emisión por color de LED.
export const LED_COLORS: Record<string, { vf: number; body: string; light: string; label: string }> = {
  red: { vf: 1.9, body: '#e8372f', light: '#ff3b2f', label: 'Rojo' },
  orange: { vf: 2.0, body: '#f28a1c', light: '#ff9a2e', label: 'Naranja' },
  yellow: { vf: 2.05, body: '#f2d21c', light: '#ffe23d', label: 'Amarillo' },
  green: { vf: 2.1, body: '#2fbf4a', light: '#46ff6a', label: 'Verde' },
  blue: { vf: 3.0, body: '#2f6fe8', light: '#4d8dff', label: 'Azul' },
  white: { vf: 3.1, body: '#e9eef5', light: '#ffffff', label: 'Blanco' },
};

/** Diodo emisor ajustado para dar vf a 20 mA con n = 2. */
export const ledDiode = (a: number, k: number, vf: number) => new Diode(a, k, 0.02 / Math.exp(vf / (2 * VT)), 2);

// ── LED 5 mm ───────────────────────────────────────────────────────────────────
const LedRender = memo(function LedRender({ part, visual }: RenderProps) {
  const color = LED_COLORS[String(part.props.color)] ?? LED_COLORS.red;
  const i = Number(visual?.i ?? 0);
  const burnt = i > 0.06;
  const k = burnt ? 0 : ledIntensity(i);
  return (
    <g>
      <Leg x={0} y0={-12} y1={0} />
      <path d="M10 -12 V-6 L10 0" stroke="#a8afb6" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <path d="M10 -12 L13 -9 L10 -6" stroke="#a8afb6" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Glow cx={5} cy={-25} r={34} color={color.light} intensity={k} />
      {/* reborde y cúpula */}
      <rect x={-5} y={-15} width={20} height={4} rx={1} fill={burnt ? '#3a2b28' : color.body} opacity={0.95} />
      <path d="M-3 -15 V-29 A8 8 0 0 1 13 -29 V-15 Z" fill={burnt ? '#3a2b28' : color.body} opacity={0.82} />
      <path d="M-3 -15 V-29 A8 8 0 0 1 13 -29 V-15 Z" fill={color.light} opacity={k} />
      <ellipse cx={5} cy={-24} rx={4.5} ry={6} fill="#fff" opacity={k * 0.7} filter={k > 0.05 ? 'url(#f-soft)' : undefined} />
      <path d="M0 -17 V-28 A5 5 0 0 1 4 -33" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {/* reflector interno */}
      <path d="M2 -18 h4 l1 -3 h-6z" fill="#000" opacity={0.25} />
      {burnt && <path d="M0 -30 l4 6 l-2 3 l5 5" stroke="#111" strokeWidth={1} fill="none" />}
      {i > 0.03 && <WarningBadge x={16} y={-32} label={`Corriente ${formatSI(i, 'A')} (máx. 20 mA)${burnt ? ': LED dañado' : ''}`} />}
    </g>
  );
});

export const led: PartDef = {
  type: 'led',
  name: 'LED 5 mm',
  category: 'Salidas',
  description: 'Diodo emisor con modelo de Shockley. Patilla larga (derecha) = ánodo.',
  keywords: ['led', 'diodo', 'luz', 'rojo', 'verde', 'azul', 'amarillo', 'blanco'],
  defaults: { color: 'red' },
  pins: () => [
    { id: 'K', x: 0, y: 0, kind: 'leg', label: 'Cátodo (−)' },
    { id: 'A', x: 10, y: 0, kind: 'leg', label: 'Ánodo (+)' },
  ],
  bounds: () => ({ x: -6, y: -38, w: 22, h: 39 }),
  fields: [
    {
      key: 'color',
      label: 'Color',
      kind: 'select',
      options: Object.entries(LED_COLORS).map(([value, c]) => ({ value, label: `${c.label} (Vf ${c.vf} V)` })),
    },
  ],
  model: 'SPICE',
  thumbScale: 1.6,
  sim(ctx) {
    const color = () => LED_COLORS[String(ctx.props.color)] ?? LED_COLORS.red;
    const d = ledDiode(ctx.net('A'), ctx.net('K'), color().vf);
    return { elements: [d], probe: (v) => ({ i: Math.max(0, d.currentOf(v)) }) };
  },
  Render: LedRender,
};

// ── LED RGB (cátodo común) ─────────────────────────────────────────────────────
const RgbRender = memo(function RgbRender({ visual }: RenderProps) {
  const r = ledIntensity(Number(visual?.r ?? 0));
  const g = ledIntensity(Number(visual?.g ?? 0));
  const b = ledIntensity(Number(visual?.b ?? 0));
  const mix = `rgb(${Math.round(255 * Math.min(1, r + 0.08))},${Math.round(255 * Math.min(1, g + 0.08))},${Math.round(255 * Math.min(1, b + 0.08))})`;
  const k = Math.max(r, g, b);
  return (
    <g>
      <Leg x={0} y0={-12} y1={0} />
      <Leg x={10} y0={-14} y1={0} />
      <Leg x={20} y0={-12} y1={0} />
      <Leg x={30} y0={-12} y1={0} />
      <Glow cx={15} cy={-26} r={32} color={mix} intensity={k} />
      <rect x={4} y={-16} width={22} height={4} rx={1} fill="#e8ecf2" opacity={0.9} />
      <path d="M6 -16 V-31 A9 9 0 0 1 24 -31 V-16 Z" fill="#eef2f7" opacity={0.75} />
      <path d="M6 -16 V-31 A9 9 0 0 1 24 -31 V-16 Z" fill={mix} opacity={k * 0.85} />
      <path d="M9 -18 V-30 A6 6 0 0 1 14 -36" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <g fontSize="4" fill="#667" textAnchor="middle">
        <text x={0} y={7}>R</text>
        <text x={10} y={7}>−</text>
        <text x={20} y={7}>G</text>
        <text x={30} y={7}>B</text>
      </g>
    </g>
  );
});

export const rgbLed: PartDef = {
  type: 'rgb-led',
  name: 'LED RGB',
  category: 'Salidas',
  description: 'Tres LEDs (rojo, verde, azul) con cátodo común en la segunda patilla.',
  keywords: ['rgb', 'led', 'color', 'multicolor'],
  defaults: {},
  pins: () => [
    { id: 'R', x: 0, y: 0, kind: 'leg', label: 'Rojo' },
    { id: 'COM', x: 10, y: 0, kind: 'leg', label: 'Cátodo común' },
    { id: 'G', x: 20, y: 0, kind: 'leg', label: 'Verde' },
    { id: 'B', x: 30, y: 0, kind: 'leg', label: 'Azul' },
  ],
  bounds: () => ({ x: -3, y: -41, w: 36, h: 49 }),
  model: 'SPICE',
  thumbScale: 1.4,
  sim(ctx) {
    const k = ctx.net('COM');
    const r = ledDiode(ctx.net('R'), k, 1.9);
    const g = ledDiode(ctx.net('G'), k, 2.9);
    const b = ledDiode(ctx.net('B'), k, 3.0);
    return { elements: [r, g, b], probe: (v) => ({ r: Math.max(0, r.currentOf(v)), g: Math.max(0, g.currentOf(v)), b: Math.max(0, b.currentOf(v)) }) };
  },
  Render: RgbRender,
};

// ── Zumbador piezoeléctrico ──────────────────────────────────────────────────
const BuzzerRender = memo(function BuzzerRender({ visual }: RenderProps) {
  const f = Number(visual?.freq ?? 0);
  const on = f > 20;
  return (
    <g>
      <Leg x={0} y0={-6} y1={0} />
      <Leg x={20} y0={-6} y1={0} />
      <circle cx={10} cy={-28} r={23} fill="url(#g-black-plastic)" />
      <circle cx={10} cy={-28} r={17} fill="#141416" stroke="#2b2c30" strokeWidth={1} />
      <circle cx={10} cy={-28} r={3} fill="#050505" />
      <text x={-6} y={-40} fontSize="6" fill="#bbb" fontWeight="700">+</text>
      {on && (
        <g stroke="#7cc4ff" strokeWidth={1.4} fill="none" opacity={0.85} strokeLinecap="round">
          <path d="M38 -40 a14 14 0 0 1 0 24" />
          <path d="M44 -45 a20 20 0 0 1 0 34" />
          <text x={50} y={-52} fontSize="7" fill="#7cc4ff" stroke="none">
            {Math.round(f)} Hz
          </text>
        </g>
      )}
    </g>
  );
});

function edgeTracker(node: () => number, ref: () => number) {
  let high = false;
  let edges = 0;
  let time = 0;
  let last: Visual = { freq: 0 };
  return {
    sample(v: Float64Array, dt: number) {
      const n = node();
      const r = ref();
      const volts = (n < 0 ? 0 : v[n]) - (r < 0 ? 0 : v[r]);
      const now = volts > 1.5;
      if (now && !high) edges++;
      high = now;
      time += dt;
      if (time >= 0.1) {
        last = { freq: edges / time };
        edges = 0;
        time = 0;
      }
    },
    read: () => last,
  };
}

export const buzzer: PartDef = {
  type: 'buzzer',
  name: 'Zumbador piezo',
  category: 'Salidas',
  description: 'Suena con tone() o una señal PWM. Detecta la frecuencia en tiempo real.',
  keywords: ['zumbador', 'buzzer', 'piezo', 'sonido', 'tone', 'altavoz'],
  defaults: {},
  pins: () => [
    { id: '+', x: 0, y: 0, kind: 'leg', label: '+' },
    { id: '-', x: 20, y: 0, kind: 'leg', label: '−' },
  ],
  bounds: () => ({ x: -14, y: -52, w: 48, h: 53 }),
  model: 'Comportamental',
  thumbScale: 1.1,
  sim(ctx) {
    const p = ctx.net('+');
    const n = ctx.net('-');
    return { elements: [new Resistor(p, n, () => 2000)], tracker: edgeTracker(() => p, () => n) };
  },
  Render: BuzzerRender,
};

// ── Micro servo SG90 ───────────────────────────────────────────────────────────
const ServoRender = memo(function ServoRender({ visual }: RenderProps) {
  const angle = Number(visual?.angle ?? 90);
  return (
    <g>
      {/* cables */}
      <path d="M0 0 V-14 Q0 -22 8 -24 H20" stroke="#6b3e26" strokeWidth={2.4} fill="none" />
      <path d="M10 0 V-12 Q10 -20 16 -20 H20" stroke="#d63a2f" strokeWidth={2.4} fill="none" />
      <path d="M20 0 V-16" stroke="#f08a24" strokeWidth={2.4} fill="none" />
      <rect x={-3} y={-6} width={26} height={8} rx={1.5} fill="#1b1b1d" />
      <rect x={20} y={-60} width={88} height={46} rx={3} fill="url(#g-servo)" />
      <rect x={10} y={-44} width={108} height={8} rx={2} fill="#2f63c2" />
      <circle cx={16} cy={-40} r={2.5} fill="#0f1e3d" />
      <circle cx={112} cy={-40} r={2.5} fill="#0f1e3d" />
      <text x={64} y={-22} fontSize="7" fill="#d9e6ff" textAnchor="middle" fontWeight="600">
        SG90
      </text>
      <circle cx={84} cy={-60} r={11} fill="#2a5bb8" />
      <g transform={`rotate(${angle - 90} 84 -60)`}>
        <path d="M84 -66 L84 -66 L126 -62 Q130 -60 126 -58 L84 -54 Z" fill="#f3f4f6" stroke="#c4c8ce" strokeWidth={0.6} />
        <circle cx={84} cy={-60} r={7} fill="#f3f4f6" stroke="#c4c8ce" strokeWidth={0.6} />
        {[96, 106, 116].map((x) => (
          <circle key={x} cx={x} cy={-60} r={1.2} fill="#c4c8ce" />
        ))}
      </g>
      <circle cx={84} cy={-60} r={2.4} fill="#9aa1a9" />
      <text x={64} y={-8} fontSize="5" fill="#556" textAnchor="middle">
        {Math.round(angle)}°
      </text>
    </g>
  );
});

export const servo: PartDef = {
  type: 'servo',
  name: 'Micro servo SG90',
  category: 'Salidas',
  description: 'Lee la anchura del pulso (544–2400 µs) de la librería Servo y gira de 0° a 180°.',
  keywords: ['servo', 'motor', 'sg90', 'pwm', 'angulo'],
  defaults: {},
  pins: () => [
    { id: 'GND', x: 0, y: 0, kind: 'leg', label: 'GND (marrón)' },
    { id: 'V+', x: 10, y: 0, kind: 'leg', label: 'V+ (rojo)' },
    { id: 'SIG', x: 20, y: 0, kind: 'leg', label: 'Señal (naranja)' },
  ],
  bounds: () => ({ x: -4, y: -72, w: 136, h: 74 }),
  model: 'Comportamental',
  thumbScale: 0.75,
  sim(ctx) {
    const gnd = ctx.net('GND');
    const vp = ctx.net('V+');
    const sig = ctx.net('SIG');
    let high = false;
    let width = 0;
    let angle = 90;
    return {
      elements: [new Resistor(vp, gnd, () => 200), new Resistor(sig, gnd, () => 1e6)],
      tracker: {
        sample(v, dt) {
          const volts = (sig < 0 ? 0 : v[sig]) - (gnd < 0 ? 0 : v[gnd]);
          const supply = (vp < 0 ? 0 : v[vp]) - (gnd < 0 ? 0 : v[gnd]);
          const now = volts > 2;
          if (now) width += dt;
          if (!now && high && supply > 3.5) {
            const us = width * 1e6;
            if (us > 400 && us < 2600) angle = Math.min(180, Math.max(0, ((us - 544) / (2400 - 544)) * 180));
          }
          if (now && !high) width = 0;
          high = now;
        },
        read: () => ({ angle }),
      },
    };
  },
  Render: ServoRender,
};

// ── Display de 7 segmentos (cátodo común) ─────────────────────────────────────
const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;
const SEG_PATHS: Record<string, string> = {
  a: 'M8 -52 h20 l-3 4 h-14 z',
  b: 'M29 -51 l3 3 -2 18 -3 2 -2 -3 2 -16 z',
  c: 'M27 -27 l3 2 -2 18 -3 3 -2 -4 2 -16 z',
  d: 'M4 -4 h18 l3 -4 h-18 z',
  e: 'M5 -27 l3 2 -2 16 -2 4 -3 -3 2 -18 z',
  f: 'M8 -51 l3 3 -2 16 -3 3 -2 -2 2 -18 z',
  g: 'M9 -29 h16 l2 2 -2 2 h-16 l-2 -2 z',
  dp: 'M30 -6 a2.6 2.6 0 1 0 0.01 0 z',
};

const SevenSegRender = memo(function SevenSegRender({ visual }: RenderProps) {
  return (
    <g>
      <rect x={-8} y={-6} width={56} height={72} rx={2} fill="#1d1e21" filter="url(#f-shadow)" />
      <rect x={-6} y={-4} width={52} height={68} rx={1.5} fill="#121315" />
      <g transform="translate(8 62) skewX(-6)">
        {SEGMENTS.map((s) => {
          const k = ledIntensity(Number(visual?.[s] ?? 0), 0.01);
          return <path key={s} d={SEG_PATHS[s]} fill={k > 0.02 ? `rgba(255,60,40,${0.35 + 0.65 * k})` : '#2a1d1c'} style={k > 0.02 ? { filter: 'drop-shadow(0 0 3px #ff3b2f)' } : undefined} />;
        })}
      </g>
      <g fontSize="3.6" fill="#6d7077" textAnchor="middle" fontFamily="Geist, sans-serif">
        {SEG_PINS.map(([id, x, y]) => (
          <text key={id} x={x} y={y === 0 ? -1 : 64}>
            {id.replace(/\d/, '')}
          </text>
        ))}
      </g>
    </g>
  );
});

// Distribución de pines del display de 0.56" cátodo común: arriba g f COM a b; abajo e d COM c dp.
const SEG_PINS: [string, number, number][] = [
  ['g', 0, 0],
  ['f', 10, 0],
  ['COM1', 20, 0],
  ['a', 30, 0],
  ['b', 40, 0],
  ['e', 0, 60],
  ['d', 10, 60],
  ['COM2', 20, 60],
  ['c', 30, 60],
  ['dp', 40, 60],
];

export const sevenSegment: PartDef = {
  type: 'seven-segment',
  name: 'Display 7 segmentos',
  category: 'Salidas',
  description: 'Display de 0.56" de cátodo común. Cada segmento es un LED rojo.',
  keywords: ['7 segmentos', 'display', 'digito', 'seven segment', 'numero'],
  defaults: {},
  // Los pines quedan 0.6" separados: encaja en las filas c y g de una protoboard.
  pins: () => SEG_PINS.map(([id, x, y]) => ({ id, x, y, kind: 'leg' as const, label: id })),
  internal: () => [['COM1', 'COM2']],
  bounds: () => ({ x: -9, y: -7, w: 58, h: 74 }),
  model: 'SPICE',
  thumbScale: 0.9,
  sim(ctx) {
    const com = ctx.net('COM1');
    const diodes = SEGMENTS.map((s) => [s, ledDiode(ctx.net(s), com, 1.9)] as const);
    return {
      elements: diodes.map(([, d]) => d),
      probe: (v) => Object.fromEntries(diodes.map(([s, d]) => [s, Math.max(0, d.currentOf(v))])),
    };
  },
  Render: SevenSegRender,
};

// ── Motor DC ───────────────────────────────────────────────────────────────────
function MotorRender({ visual }: RenderProps) {
  const i = Number(visual?.i ?? 0);
  const speed = Math.min(1, Math.abs(i) / 0.25);
  const dir = i >= 0 ? 1 : -1;
  return (
    <g>
      <Leg x={0} y0={-10} y1={0} />
      <Leg x={20} y0={-10} y1={0} />
      <rect x={-8} y={-50} width={36} height={42} rx={6} fill="url(#g-metal)" stroke="#6f767e" strokeWidth={0.6} />
      <rect x={-8} y={-16} width={36} height={8} rx={2} fill="#2a2b2f" />
      <rect x={-2} y={-58} width={24} height={8} rx={2} fill="url(#g-metal-v)" />
      <g style={{ transformOrigin: '10px -64px', animation: speed > 0.02 ? `spin ${Math.max(0.08, 0.8 / speed)}s linear infinite ${dir < 0 ? 'reverse' : 'normal'}` : undefined }}>
        <circle cx={10} cy={-64} r={10} fill="#f0b429" stroke="#b07d10" strokeWidth={0.8} />
        <path d="M10 -74 V-54 M0 -64 H20" stroke="#b07d10" strokeWidth={1.6} />
      </g>
      <text x={10} y={-28} fontSize="5.5" fill="#2a2b2f" textAnchor="middle" fontWeight="600">
        DC 3–6 V
      </text>
    </g>
  );
}

export const dcMotor: PartDef = {
  type: 'dc-motor',
  name: 'Motor DC',
  category: 'Salidas',
  description: 'Motor de corriente continua (modelo resistivo de 20 Ω). La velocidad sigue a la corriente.',
  keywords: ['motor', 'dc', 'giro', 'rueda'],
  defaults: {},
  pins: () => [
    { id: '1', x: 0, y: 0, kind: 'leg' },
    { id: '2', x: 20, y: 0, kind: 'leg' },
  ],
  bounds: () => ({ x: -9, y: -75, w: 38, h: 76 }),
  model: 'Comportamental',
  thumbScale: 1,
  sim(ctx) {
    const r = new Resistor(ctx.net('1'), ctx.net('2'), () => 20);
    return { elements: [r], probe: (v) => ({ i: r.currentOf(v) }) };
  },
  Render: MotorRender,
};
