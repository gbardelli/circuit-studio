import { memo, useState } from 'react';
import { NPN, Resistor, VSource } from '../core/solver';
import { formatSI } from '../core/units';
import type { PartDef, RenderProps } from './types';
import { Leg } from './common';

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// ── Pulsador táctil 6×6 mm ────────────────────────────────────────────────────
function ButtonRender({ part, onInput, preview, visual }: RenderProps) {
  const [down, setDown] = useState(false);
  const color = String(part.props.cap ?? 'red');
  const caps: Record<string, string> = { red: '#d63a2f', black: '#1e1f22', blue: '#2f6fe8', green: '#2fbf4a', yellow: '#f2d21c' };
  const live = !preview && onInput && visual != null;
  const press = (v: boolean) => {
    setDown(v);
    onInput?.('pressed', v);
  };
  return (
    <g>
      {[
        [0, 0],
        [20, 0],
        [0, 30],
        [20, 30],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 1.2} y={y - 3} width={2.4} height={6} fill="#a8afb6" />
      ))}
      <rect x={-3} y={2} width={26} height={26} rx={2} fill="url(#g-metal)" stroke="#727a82" strokeWidth={0.5} />
      <rect x={-1} y={4} width={22} height={22} rx={1.5} fill="#24262a" />
      {[
        [1.5, 6.5],
        [18.5, 6.5],
        [1.5, 23.5],
        [18.5, 23.5],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill="#0c0d0f" />
      ))}
      <g
        data-interactive={live ? 'true' : undefined}
        style={{ cursor: live ? 'pointer' : undefined }}
        onPointerDown={(e) => {
          if (!live) return;
          e.stopPropagation();
          (e.target as Element).setPointerCapture(e.pointerId);
          press(true);
        }}
        onPointerUp={() => live && press(false)}
        onPointerCancel={() => live && press(false)}
      >
        <circle cx={10} cy={15} r={down ? 7.2 : 7.8} fill={caps[color] ?? caps.red} />
        <circle cx={10} cy={15} r={down ? 5.6 : 6.2} fill="#fff" opacity={down ? 0.05 : 0.14} />
      </g>
    </g>
  );
}

export const pushbutton: PartDef = {
  type: 'pushbutton',
  name: 'Pulsador',
  category: 'Entradas',
  description: 'Pulsador táctil de 4 patillas. Colócalo sobre el canal central. Haz clic durante la simulación.',
  keywords: ['pulsador', 'boton', 'button', 'switch', 'tactil'],
  defaults: { cap: 'red' },
  pins: () => [
    { id: '1a', x: 0, y: 0, kind: 'leg' },
    { id: '2a', x: 20, y: 0, kind: 'leg' },
    { id: '1b', x: 0, y: 30, kind: 'leg' },
    { id: '2b', x: 20, y: 30, kind: 'leg' },
  ],
  internal: () => [
    ['1a', '1b'],
    ['2a', '2b'],
  ],
  bounds: () => ({ x: -4, y: -3, w: 28, h: 36 }),
  fields: [
    {
      key: 'cap',
      label: 'Color del botón',
      kind: 'select',
      options: [
        { value: 'red', label: 'Rojo' },
        { value: 'black', label: 'Negro' },
        { value: 'blue', label: 'Azul' },
        { value: 'green', label: 'Verde' },
        { value: 'yellow', label: 'Amarillo' },
      ],
    },
  ],
  model: 'Ideal',
  thumbScale: 1.5,
  sim(ctx) {
    return { elements: [new Resistor(ctx.net('1a'), ctx.net('2a'), () => (ctx.input('pressed') ? 0.05 : 1e9))] };
  },
  Render: ButtonRender,
};

// ── Interruptor deslizante SPDT ───────────────────────────────────────────────
const SlideRender = memo(function SlideRender({ part, onInput, preview }: RenderProps) {
  const on = Boolean(part.props.on);
  const live = !preview && onInput;
  return (
    <g>
      <Leg x={0} y0={-6} y1={0} />
      <Leg x={10} y0={-6} y1={0} />
      <Leg x={20} y0={-6} y1={0} />
      <rect x={-8} y={-22} width={36} height={16} rx={2} fill="url(#g-metal)" stroke="#727a82" strokeWidth={0.5} />
      <rect x={-4} y={-18} width={28} height={8} rx={1} fill="#24262a" />
      <g
        data-interactive={live ? 'true' : undefined}
        style={{ cursor: live ? 'pointer' : undefined }}
        onPointerDown={(e) => {
          if (!live) return;
          e.stopPropagation();
          onInput?.('on', !on);
        }}
      >
        <rect x={on ? 12 : -2} y={-28} width={12} height={14} rx={1.5} fill="#2b2c30" />
        <rect x={on ? 13.5 : -0.5} y={-27} width={9} height={4} rx={1} fill="#4a4c52" />
      </g>
    </g>
  );
});

export const slideSwitch: PartDef = {
  type: 'slide-switch',
  name: 'Interruptor deslizante',
  category: 'Entradas',
  description: 'Conmutador de una vía y dos posiciones. La patilla central es común.',
  keywords: ['interruptor', 'switch', 'conmutador', 'spdt', 'deslizante'],
  defaults: { on: false },
  pins: () => [
    { id: '1', x: 0, y: 0, kind: 'leg' },
    { id: 'C', x: 10, y: 0, kind: 'leg', label: 'Común' },
    { id: '2', x: 20, y: 0, kind: 'leg' },
  ],
  bounds: () => ({ x: -9, y: -29, w: 38, h: 30 }),
  fields: [{ key: 'on', label: 'Posición derecha', kind: 'boolean' }],
  model: 'Ideal',
  thumbScale: 1.4,
  sim(ctx) {
    return {
      elements: [new Resistor(ctx.net('1'), ctx.net('C'), () => (ctx.props.on ? 1e9 : 0.05)), new Resistor(ctx.net('C'), ctx.net('2'), () => (ctx.props.on ? 0.05 : 1e9))],
    };
  },
  Render: SlideRender,
};

// ── Pila de 9 V ────────────────────────────────────────────────────────────────
const Battery9Render = memo(function Battery9Render({ visual }: RenderProps) {
  const i = Number(visual?.i ?? 0);
  return (
    <g>
      <path d="M0 0 V-14 Q0 -22 4 -28" stroke="#1b1b1d" strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <path d="M10 0 V-14 Q10 -22 14 -28" stroke="#d63a2f" strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <rect x={-6} y={-40} width={30} height={13} rx={3} fill="#1b1b1d" />
      <g filter="url(#f-shadow)">
        <rect x={-22} y={-150} width={62} height={112} rx={5} fill="url(#g-battery)" />
      </g>
      <rect x={-22} y={-150} width={62} height={34} rx={5} fill="#f0b429" />
      <rect x={-22} y={-122} width={62} height={6} fill="#f0b429" />
      <text x={9} y={-127} textAnchor="middle" fontSize="16" fontWeight="800" fill="#1b1b1d" fontFamily="Geist, sans-serif">
        9V
      </text>
      <text x={9} y={-90} textAnchor="middle" fontSize="7" fill="#c9cbd1" fontFamily="Geist, sans-serif" letterSpacing="1">
        ALCALINA
      </text>
      <text x={9} y={-80} textAnchor="middle" fontSize="5.5" fill="#8e9097" fontFamily="Geist, sans-serif">
        6LR61
      </text>
      <text x={-12} y={-46} fontSize="9" fill="#e9eaee" fontWeight="700">−</text>
      <text x={24} y={-46} fontSize="9" fill="#ff7a6e" fontWeight="700">+</text>
      {Math.abs(i) > 0.0005 && (
        <text x={9} y={-60} textAnchor="middle" fontSize="6" fill="#a5e8b8" fontFamily="Geist, sans-serif">
          {formatSI(i, 'A')}
        </text>
      )}
    </g>
  );
});

export const battery9v: PartDef = {
  type: 'battery-9v',
  name: 'Pila 9 V',
  category: 'Energía',
  description: 'Pila alcalina de 9 V con conector de presión. Resistencia interna 1.5 Ω.',
  keywords: ['pila', 'bateria', '9v', 'battery', 'alimentacion'],
  defaults: { voltage: 9 },
  pins: () => [
    { id: '-', x: 0, y: 0, kind: 'leg', label: '− (negro)' },
    { id: '+', x: 10, y: 0, kind: 'leg', label: '+ (rojo)' },
  ],
  reference: '-',
  bounds: () => ({ x: -23, y: -151, w: 64, h: 152 }),
  fields: [{ key: 'voltage', label: 'Tensión', kind: 'si', unit: 'V' }],
  model: 'Ideal',
  thumbScale: 0.5,
  sim(ctx) {
    const src = new VSource(ctx.net('+'), ctx.net('-'), () => num(ctx.props.voltage, 9), () => 1.5);
    return { elements: [src], probe: (v) => ({ i: src.currentOf(v) }) };
  },
  Render: Battery9Render,
};

// ── Portapilas AA ─────────────────────────────────────────────────────────────
const PackRender = memo(function PackRender({ part }: RenderProps) {
  const cells = num(part.props.cells, 2);
  const w = cells * 22 + 10;
  return (
    <g>
      <path d="M0 0 V-12 Q0 -18 -4 -22" stroke="#1b1b1d" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <path d="M10 0 V-12 Q10 -18 14 -22" stroke="#d63a2f" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <g filter="url(#f-shadow)">
        <rect x={5 - w / 2} y={-110} width={w} height={88} rx={4} fill="#202124" />
      </g>
      {Array.from({ length: cells }, (_, i) => {
        const x = 5 - w / 2 + 6 + i * 22;
        const up = i % 2 === 0;
        return (
          <g key={i}>
            <rect x={x} y={-104} width={18} height={76} rx={3} fill={up ? '#2e7d4f' : '#1d1d1f'} />
            <rect x={x} y={up ? -104 : -36} width={18} height={8} rx={2} fill="url(#g-metal)" />
            <rect x={x + 6} y={up ? -107 : -30} width={6} height={3} rx={1} fill="url(#g-metal-v)" />
            <text x={x + 9} y={-64} fontSize="5" fill="#e6e6e6" textAnchor="middle" transform={`rotate(-90 ${x + 9} -64)`}>
              AA 1.5V
            </text>
          </g>
        );
      })}
    </g>
  );
});

export const aaPack: PartDef = {
  type: 'aa-pack',
  name: 'Portapilas AA',
  category: 'Energía',
  description: 'Portapilas de 2 o 4 pilas AA en serie (3 V o 6 V).',
  keywords: ['pilas', 'aa', 'portapilas', 'bateria', '3v', '6v'],
  defaults: { cells: 2 },
  pins: () => [
    { id: '-', x: 0, y: 0, kind: 'leg', label: '− (negro)' },
    { id: '+', x: 10, y: 0, kind: 'leg', label: '+ (rojo)' },
  ],
  reference: '-',
  bounds: (p) => {
    const w = num(p.cells, 2) * 22 + 10;
    return { x: 5 - w / 2, y: -111, w, h: 112 };
  },
  fields: [
    {
      key: 'cells',
      label: 'Pilas',
      kind: 'select',
      options: [
        { value: '2', label: '2 × AA (3 V)' },
        { value: '4', label: '4 × AA (6 V)' },
      ],
    },
  ],
  model: 'Ideal',
  thumbScale: 0.6,
  sim(ctx) {
    return { elements: [new VSource(ctx.net('+'), ctx.net('-'), () => 1.5 * num(ctx.props.cells, 2), () => 0.15 * num(ctx.props.cells, 2))] };
  },
  Render: PackRender,
};

// ── Transistor NPN TO-92 ───────────────────────────────────────────────────────
const NpnRender = memo(function NpnRender() {
  return (
    <g>
      <Leg x={0} y0={-12} y1={0} />
      <Leg x={10} y0={-12} y1={0} />
      <Leg x={20} y0={-12} y1={0} />
      <path d="M-4 -12 H24 V-30 A14 10 0 0 0 -4 -30 Z" fill="url(#g-black-plastic)" />
      <path d="M-4 -12 H24 V-15 H-4 Z" fill="#000" opacity={0.3} />
      <text x={10} y={-22} fontSize="4.6" fill="#c9cbd1" textAnchor="middle" fontFamily="Geist, sans-serif">
        2N2222
      </text>
      <g fontSize="4" fill="#667" textAnchor="middle">
        <text x={0} y={7}>E</text>
        <text x={10} y={7}>B</text>
        <text x={20} y={7}>C</text>
      </g>
    </g>
  );
});

export const npn: PartDef = {
  type: 'npn',
  name: 'Transistor NPN 2N2222',
  category: 'Semiconductores',
  description: 'Transistor bipolar NPN (Ebers-Moll, β = 150). Patillas E-B-C.',
  keywords: ['transistor', 'npn', '2n2222', 'bjt', 'bipolar'],
  defaults: {},
  pins: () => [
    { id: 'E', x: 0, y: 0, kind: 'leg', label: 'Emisor' },
    { id: 'B', x: 10, y: 0, kind: 'leg', label: 'Base' },
    { id: 'C', x: 20, y: 0, kind: 'leg', label: 'Colector' },
  ],
  bounds: () => ({ x: -5, y: -41, w: 30, h: 50 }),
  model: 'SPICE',
  thumbScale: 1.4,
  sim(ctx) {
    const q = new NPN(ctx.net('C'), ctx.net('B'), ctx.net('E'));
    return { elements: [q], probe: (v) => q.currents(v) };
  },
  Render: NpnRender,
};

// ── Multímetro ─────────────────────────────────────────────────────────────────
const MeterRender = memo(function MeterRender({ part, visual }: RenderProps) {
  const mode = String(part.props.mode ?? 'V');
  const reading = visual ? (mode === 'A' ? formatSI(Number(visual.i ?? 0), 'A') : `${Number(visual.v ?? 0).toFixed(2)} V`) : mode === 'A' ? '-- mA' : '--.-- V';
  return (
    <g>
      <g filter="url(#f-shadow)">
        <rect x={0} y={0} width={80} height={140} rx={10} fill="#f0b429" />
      </g>
      <rect x={6} y={6} width={68} height={128} rx={7} fill="#2a2b2f" />
      <rect x={12} y={14} width={56} height={30} rx={3} fill="#a9b8a0" />
      <rect x={12} y={14} width={56} height={30} rx={3} fill="url(#g-board)" opacity={0.15} />
      <text x={64} y={36} textAnchor="end" fontSize="13" fontFamily="Geist, sans-serif" fill="#1d2418">
        {reading}
      </text>
      <circle cx={40} cy={78} r={18} fill="#1a1b1e" stroke="#3a3c40" strokeWidth={1} />
      <circle cx={40} cy={78} r={12} fill="url(#g-knob)" />
      <rect x={38.6} y={mode === 'A' ? 66 : 62} width={2.8} height={10} rx={1.2} fill="#f0b429" transform={`rotate(${mode === 'A' ? 50 : -30} 40 78)`} />
      <text x={20} y={64} fontSize="6" fill="#d7d8dc" textAnchor="middle">V⎓</text>
      <text x={60} y={64} fontSize="6" fill="#d7d8dc" textAnchor="middle">mA</text>
      <circle cx={20} cy={120} r={6} fill="#111" stroke="#555" />
      <circle cx={60} cy={120} r={6} fill="#111" stroke="#d63a2f" />
      <text x={20} y={108} fontSize="5" fill="#d7d8dc" textAnchor="middle">COM</text>
      <text x={60} y={108} fontSize="5" fill="#d7d8dc" textAnchor="middle">{mode === 'A' ? 'mA' : 'VΩ'}</text>
    </g>
  );
});

export const multimeter: PartDef = {
  type: 'multimeter',
  name: 'Multímetro',
  category: 'Instrumentos',
  description: 'Voltímetro (10 MΩ) o amperímetro (shunt de 0.1 Ω). Conecta cables a COM y a la entrada roja.',
  keywords: ['multimetro', 'voltimetro', 'amperimetro', 'medir', 'tester'],
  defaults: { mode: 'V' },
  pins: () => [
    { id: 'COM', x: 20, y: 120, kind: 'socket', label: 'COM' },
    { id: 'IN', x: 60, y: 120, kind: 'socket', label: 'Entrada' },
  ],
  bounds: () => ({ x: 0, y: 0, w: 80, h: 140 }),
  fields: [
    {
      key: 'mode',
      label: 'Modo',
      kind: 'select',
      options: [
        { value: 'V', label: 'Tensión continua (V)' },
        { value: 'A', label: 'Corriente continua (A)' },
      ],
    },
  ],
  model: 'Ideal',
  thumbScale: 0.6,
  sim(ctx) {
    const a = ctx.net('IN');
    const b = ctx.net('COM');
    const r = new Resistor(a, b, () => (ctx.props.mode === 'A' ? 0.1 : 10e6));
    return {
      elements: [r],
      probe: (v) => ({ v: (a < 0 ? 0 : v[a]) - (b < 0 ? 0 : v[b]), i: r.currentOf(v) }),
    };
  },
  Render: MeterRender,
};
