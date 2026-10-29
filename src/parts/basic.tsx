import { memo, useRef } from 'react';
import { Capacitor, Resistor } from '../core/solver';
import { formatSI, resistorBands } from '../core/units';
import type { PartDef, RenderProps } from './types';
import { Leg } from './common';

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// ── Resistencia ────────────────────────────────────────────────────────────────
const ResistorRender = memo(function ResistorRender({ part, visual }: RenderProps) {
  const ohms = num(part.props.resistance, 220);
  const bands = resistorBands(ohms);
  const power = Number(visual?.p ?? 0);
  const rating = num(part.props.power, 0.25);
  const hot = power > rating;
  return (
    <g>
      <line x1={0} y1={0} x2={40} y2={0} stroke="#7b848b" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={0} y1={-0.35} x2={40} y2={-0.35} stroke="#dde3e6" strokeWidth={0.6} strokeLinecap="round" />
      <path
        d="M9 -5.5 Q9 -7 11 -7 H14 Q16 -5 18 -5 H22 Q24 -5 26 -7 H29 Q31 -7 31 -5.5 V5.5 Q31 7 29 7 H26 Q24 5 22 5 H18 Q16 5 14 7 H11 Q9 7 9 5.5 Z"
        fill={hot ? '#d9844f' : 'url(#g-resistor)'}
        stroke="#a9865a"
        strokeWidth={0.5}
      />
      <rect x={12} y={-6.6} width={2.2} height={13.2} fill={bands[0]} />
      <rect x={17} y={-5} width={2.2} height={10} fill={bands[1]} />
      <rect x={21} y={-5} width={2.2} height={10} fill={bands[2]} />
      <rect x={26.4} y={-6.6} width={2.2} height={13.2} fill={bands[3]} />
      <path d="M11 -4.5 H29" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.2} />
    </g>
  );
});

export const resistor: PartDef = {
  type: 'resistor',
  name: 'Resistencia',
  category: 'Básicos',
  description: 'Resistencia de carbón de 1/4 W con código de colores. Separación de patillas 0.4".',
  keywords: ['resistencia', 'resistor', 'ohm', 'r'],
  defaults: { resistance: 220, power: 0.25 },
  pins: () => [
    { id: '1', x: 0, y: 0, kind: 'leg' },
    { id: '2', x: 40, y: 0, kind: 'leg' },
  ],
  bounds: () => ({ x: -2, y: -8, w: 44, h: 16 }),
  fields: [
    { key: 'resistance', label: 'Resistencia', kind: 'si', unit: 'Ω', min: 0.1 },
    {
      key: 'power',
      label: 'Potencia nominal',
      kind: 'select',
      options: [
        { value: '0.125', label: '1/8 W' },
        { value: '0.25', label: '1/4 W' },
        { value: '0.5', label: '1/2 W' },
        { value: '1', label: '1 W' },
      ],
    },
  ],
  model: 'Ideal',
  thumbScale: 1.6,
  sim(ctx) {
    const r = new Resistor(ctx.net('1'), ctx.net('2'), () => num(ctx.props.resistance, 220));
    return {
      elements: [r],
      probe: (v) => {
        const i = r.currentOf(v);
        return { i: Math.abs(i), p: i * i * num(ctx.props.resistance, 220) };
      },
    };
  },
  Render: ResistorRender,
};

// ── Condensador electrolítico ─────────────────────────────────────────────────
const CapacitorRender = memo(function CapacitorRender({ part }: RenderProps) {
  const c = num(part.props.capacitance, 100e-6);
  return (
    <g>
      <Leg x={0} y0={-8} y1={0} />
      <Leg x={10} y0={-8} y1={0} />
      <g className="cap-can">
      <rect x={-4} y={-36} width={18} height={29} rx={3} fill="url(#g-cap)" />
      <path d="M-2 -32v22M12 -32v22" stroke="#14283e" strokeWidth="0.7" opacity="0.65" />
      <path d="M-2.8 -30v18" stroke="#d1e1ff" strokeWidth="0.6" opacity="0.35" />
      <ellipse cx={5} cy={-8.5} rx={8} ry={1.8} fill="#102b53" />
      <rect x={-4} y={-36} width={5} height={29} fill="#d7e1f5" opacity={0.85} />
      <text x={-1.5} y={-26} fontSize="5" fill="#1d3b7a" textAnchor="middle" fontWeight="700">
        −
      </text>
      <text x={-1.5} y={-15} fontSize="5" fill="#1d3b7a" textAnchor="middle" fontWeight="700">
        −
      </text>
      </g>
      <g className="cap-vent">
        <ellipse cx={5} cy={-36} rx={9} ry={2.4} fill="url(#g-metal)" stroke="#77848d" strokeWidth="0.4" />
        <path d="M1 -36 L9 -36 M5 -39 L5 -33" stroke="#7f8894" strokeWidth={0.6} />
      </g>
      <text x={8} y={-20} fontSize="4.2" fill="#e8eefc" textAnchor="middle" transform="rotate(-90 8 -20)">
        {formatSI(c, 'F', 3)}
      </text>
    </g>
  );
});

export const capacitor: PartDef = {
  type: 'capacitor',
  name: 'Condensador electrolítico',
  category: 'Básicos',
  description: 'Condensador polarizado. Patilla izquierda (franja) negativa.',
  keywords: ['condensador', 'capacitor', 'electrolitico', 'faradio', 'c'],
  defaults: { capacitance: 100e-6, voltage: 16 },
  pins: () => [
    { id: '-', x: 0, y: 0, kind: 'leg', label: '−' },
    { id: '+', x: 10, y: 0, kind: 'leg', label: '+' },
  ],
  bounds: () => ({ x: -5, y: -40, w: 20, h: 41 }),
  fields: [
    { key: 'capacitance', label: 'Capacidad', kind: 'si', unit: 'F' },
    { key: 'voltage', label: 'Tensión máxima', kind: 'si', unit: 'V' },
  ],
  model: 'Ideal',
  thumbScale: 1.4,
  sim(ctx) {
    const cap = new Capacitor(ctx.net('+'), ctx.net('-'), () => num(ctx.props.capacitance, 100e-6));
    const p = ctx.net('+');
    const n = ctx.net('-');
    return {
      elements: [cap],
      probe: (v) => ({ v: (p < 0 ? 0 : v[p]) - (n < 0 ? 0 : v[n]) }),
    };
  },
  Render: CapacitorRender,
};

// ── Potenciómetro rotativo ────────────────────────────────────────────────────
function PotRender({ part, onInput, preview }: RenderProps) {
  const pos = num(part.props.position, 0.5);
  const angle = -135 + pos * 270;
  const drag = useRef<{ y: number; start: number } | null>(null);
  const interactive = !preview && onInput;
  return (
    <g>
      <Leg x={0} y0={-10} y1={0} />
      <Leg x={10} y0={-10} y1={0} />
      <Leg x={20} y0={-10} y1={0} />
      <rect x={-6} y={-46} width={32} height={38} rx={3} fill="url(#g-servo)" />
      <rect x={-6} y={-14} width={32} height={6} fill="#1f4fa0" />
      <g
        data-interactive={interactive ? 'true' : undefined}
        style={{ cursor: interactive ? 'ns-resize' : undefined }}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, start: pos };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !onInput) return;
          const next = Math.min(1, Math.max(0, drag.current.start + (drag.current.y - e.clientY) / 160));
          onInput('position', Math.round(next * 1000) / 1000);
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => {
          if (!interactive || !onInput) return;
          e.stopPropagation();
          onInput('position', Math.min(1, Math.max(0, Math.round((pos - Math.sign(e.deltaY) * 0.02) * 100) / 100)));
        }}
      >
        <circle cx={10} cy={-28} r={13} fill="#c9ced4" stroke="#8a9199" strokeWidth={0.6} />
        <circle cx={10} cy={-28} r={10.5} fill="url(#g-knob)" />
        {Array.from({ length: 18 }, (_, i) => {
          const a = (i * 20 * Math.PI) / 180;
          return <line key={i} x1={10 + Math.cos(a) * 9} y1={-28 + Math.sin(a) * 9} x2={10 + Math.cos(a) * 10.5} y2={-28 + Math.sin(a) * 10.5} stroke="#0e0f11" strokeWidth={0.8} />;
        })}
        <g transform={`rotate(${angle} 10 -28)`}>
          <rect x={9} y={-37} width={2} height={7} rx={1} fill="#f2f3f5" />
        </g>
      </g>
      <text x={10} y={-48.5} fontSize="5" fill="#556" textAnchor="middle">
        {formatSI(num(part.props.resistance, 10000), 'Ω', 2)} · {Math.round(pos * 100)} %
      </text>
    </g>
  );
}

export const potentiometer: PartDef = {
  type: 'potentiometer',
  name: 'Potenciómetro',
  category: 'Entradas',
  description: 'Potenciómetro lineal de 3 patillas. Arrastra el mando o usa la rueda para girarlo.',
  keywords: ['potenciometro', 'pot', 'resistencia variable', 'mando', 'knob'],
  defaults: { resistance: 10000, position: 0.5 },
  pins: () => [
    { id: '1', x: 0, y: 0, kind: 'leg', label: 'Extremo 1' },
    { id: 'W', x: 10, y: 0, kind: 'leg', label: 'Cursor' },
    { id: '2', x: 20, y: 0, kind: 'leg', label: 'Extremo 2' },
  ],
  bounds: () => ({ x: -7, y: -54, w: 34, h: 55 }),
  fields: [
    { key: 'resistance', label: 'Resistencia total', kind: 'si', unit: 'Ω' },
    { key: 'position', label: 'Posición', kind: 'range', min: 0, max: 1, step: 0.01 },
  ],
  model: 'Ideal',
  thumbScale: 1.3,
  sim(ctx) {
    const total = () => num(ctx.props.resistance, 10000);
    const pos = () => Math.min(1, Math.max(0, num(ctx.props.position, 0.5)));
    return {
      elements: [new Resistor(ctx.net('1'), ctx.net('W'), () => Math.max(total() * pos(), 0.5)), new Resistor(ctx.net('W'), ctx.net('2'), () => Math.max(total() * (1 - pos()), 0.5))],
    };
  },
  Render: PotRender,
};

// ── Fotorresistencia (LDR) ────────────────────────────────────────────────────
const ldrResistance = (light: number) => {
  // De ~1 MΩ en oscuridad a ~1 kΩ con luz intensa, escala logarítmica.
  const l = Math.min(1, Math.max(0, light));
  return 10 ** (6 - 3 * l);
};

const LdrRender = memo(function LdrRender({ part }: RenderProps) {
  const light = num(part.props.light, 0.5);
  return (
    <g>
      <Leg x={0} y0={-12} y1={0} />
      <Leg x={10} y0={-12} y1={0} />
      <circle cx={5} cy={-20} r={10} fill="#e9dfc8" stroke="#b9ab8a" strokeWidth={0.6} />
      <circle cx={5} cy={-20} r={9.2} fill="none" stroke="#fff6df" strokeWidth="0.65" />
      <path d="M-1 -27 H8 V-24 H1 V-21 H9 V-18 H1 V-15 H11" fill="none" stroke="#b6322a" strokeWidth={1.4} strokeLinejoin="round" />
      <circle cx={5} cy={-20} r={10} fill="#fff6a8" opacity={light * 0.35} />
      <circle cx={5} cy={-20} r={10} fill="url(#g-led-glass)" opacity="0.45" />
    </g>
  );
});

export const ldr: PartDef = {
  type: 'ldr',
  name: 'Fotorresistencia (LDR)',
  category: 'Entradas',
  description: 'Resistencia dependiente de la luz: ~1 MΩ a oscuras, ~1 kΩ con luz intensa.',
  keywords: ['ldr', 'fotoresistencia', 'luz', 'sensor', 'photoresistor'],
  defaults: { light: 0.5 },
  pins: () => [
    { id: '1', x: 0, y: 0, kind: 'leg' },
    { id: '2', x: 10, y: 0, kind: 'leg' },
  ],
  bounds: () => ({ x: -6, y: -31, w: 22, h: 32 }),
  fields: [{ key: 'light', label: 'Luz ambiente', kind: 'range', min: 0, max: 1, step: 0.01, hint: 'Ajustable durante la simulación' }],
  model: 'Comportamental',
  thumbScale: 1.6,
  sim(ctx) {
    return { elements: [new Resistor(ctx.net('1'), ctx.net('2'), () => ldrResistance(num(ctx.props.light, 0.5)))] };
  },
  Render: LdrRender,
};
