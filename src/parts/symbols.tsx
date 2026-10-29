// Símbolos esquemáticos (IEC 60617) para la vista de esquema. Cada pieza del circuito se
// proyecta en una pieza «sch:<tipo>» con los mismos ids de pin; así selección, simulación y
// cables funcionan igual en las dos vistas.
import type { FC } from 'react';
import type { PinDef, Props } from '../core/types';
import type { Bounds, PartDef, RenderProps } from './types';
import { LED_COLORS } from './outputs';
import { ledIntensity } from './common';

const INK = 'var(--sch-ink, #c9d1dc)';
const SOFT = 'var(--sch-soft, #7b8594)';
const FONT = 'Geist, sans-serif';
const SW = 1.4;

interface Symbol {
  pins: (props: Props) => PinDef[];
  bounds: (props: Props) => Bounds;
  Render: FC<RenderProps>;
}

const pin = (id: string, x: number, y: number, label?: string): PinDef => ({ id, x, y, kind: 'leg', label: label ?? id });
const lead = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={SW} strokeLinecap="round" />;
const Name = ({ x, y, text, anchor = 'middle' }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize="6.5" fill={SOFT} fontFamily={FONT}>
    {text}
  </text>
);
const fmtR = (ohms: number) => (ohms >= 1e6 ? `${+(ohms / 1e6).toPrecision(3)}M` : ohms >= 1e3 ? `${+(ohms / 1e3).toPrecision(3)}k` : `${+ohms.toPrecision(3)}`) + 'Ω';

/** Flechas de luz (LED: salen; LDR: entran). */
const Arrows = ({ x, y, out }: { x: number; y: number; out: boolean }) => (
  <g stroke={INK} strokeWidth={1} fill="none">
    {[0, 6].map((dx) => (
      <g key={dx} transform={`translate(${x + dx} ${y}) rotate(${out ? -45 : 135})`}>
        <line x1={0} y1={0} x2={8} y2={0} />
        <path d="M8 0 l-3 -2 M8 0 l-3 2" />
      </g>
    ))}
  </g>
);

const twoPin = (render: Symbol['Render'], w = 40, h = 14): Symbol => ({
  pins: () => [pin('1', 0, 0), pin('2', w, 0)],
  bounds: () => ({ x: -2, y: -h, w: w + 4, h: h * 2 }),
  Render: render,
});

const RESISTOR: Symbol = twoPin(({ part }) => (
  <g>
    {lead(0, 0, 10, 0)}
    {lead(30, 0, 40, 0)}
    <rect x={10} y={-5} width={20} height={10} fill="none" stroke={INK} strokeWidth={SW} />
    <Name x={20} y={-9} text={fmtR(Number(part.props.resistance ?? 220))} />
  </g>
));

const DiodeShape = ({ fill = 'none' }: { fill?: string }) => (
  <g>
    {lead(0, 0, 14, 0)}
    {lead(26, 0, 40, 0)}
    <path d="M14 -7 L26 0 L14 7 Z" fill={fill} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
    <line x1={26} y1={-7} x2={26} y2={7} stroke={INK} strokeWidth={SW} />
  </g>
);

const LED_SYM: Symbol = {
  pins: () => [pin('A', 0, 0, 'Ánodo'), pin('K', 40, 0, 'Cátodo')],
  bounds: () => ({ x: -2, y: -20, w: 44, h: 30 }),
  Render: ({ part, visual }) => {
    const c = LED_COLORS[String(part.props.color)] ?? LED_COLORS.red;
    const k = ledIntensity(Number(visual?.i ?? 0));
    return (
      <g>
        {k > 0.02 && <circle cx={20} cy={0} r={14} fill={c.light} opacity={0.25 * k} />}
        <DiodeShape fill={k > 0.02 ? c.light : 'none'} />
        <Arrows x={22} y={-9} out />
      </g>
    );
  },
};

const DIODE_SYM: Symbol = {
  pins: () => [pin('A', 0, 0, 'Ánodo'), pin('K', 40, 0, 'Cátodo')],
  bounds: () => ({ x: -2, y: -12, w: 44, h: 24 }),
  Render: () => (
    <g>
      <DiodeShape />
      <Name x={20} y={-10} text="1N4007" />
    </g>
  ),
};

const CAP_SYM: Symbol = {
  pins: () => [pin('+', 0, 0), pin('-', 30, 0, '−')],
  bounds: () => ({ x: -2, y: -14, w: 34, h: 28 }),
  Render: ({ part }) => (
    <g>
      {lead(0, 0, 13, 0)}
      {lead(17, 0, 30, 0)}
      <line x1={13} y1={-9} x2={13} y2={9} stroke={INK} strokeWidth={SW} />
      <path d="M17 -9 v18" stroke={INK} strokeWidth={SW + 1.2} />
      <text x={8} y={-6} fontSize="7" fill={INK} fontFamily={FONT}>
        +
      </text>
      <Name x={15} y={-12} text={`${+(Number(part.props.capacitance ?? 1e-4) * 1e6).toPrecision(3)}µF`} />
    </g>
  ),
};

const POT_SYM: Symbol = {
  pins: () => [pin('1', 0, 0), pin('2', 40, 0), pin('W', 20, -20, 'Cursor')],
  bounds: () => ({ x: -2, y: -22, w: 44, h: 34 }),
  Render: ({ part }) => (
    <g>
      {lead(0, 0, 10, 0)}
      {lead(30, 0, 40, 0)}
      <rect x={10} y={-5} width={20} height={10} fill="none" stroke={INK} strokeWidth={SW} />
      {lead(20, -20, 20, -8)}
      <path d="M20 -6 l-3 -4 h6 z" fill={INK} />
      <Name x={20} y={14} text={fmtR(Number(part.props.resistance ?? 10000))} />
    </g>
  ),
};

const LDR_SYM: Symbol = {
  pins: () => [pin('1', 0, 0), pin('2', 40, 0)],
  bounds: () => ({ x: -2, y: -22, w: 44, h: 30 }),
  Render: () => (
    <g>
      {lead(0, 0, 10, 0)}
      {lead(30, 0, 40, 0)}
      <rect x={10} y={-5} width={20} height={10} fill="none" stroke={INK} strokeWidth={SW} />
      <Arrows x={6} y={-20} out={false} />
    </g>
  ),
};

const BUTTON_SYM: Symbol = {
  pins: () => [pin('1a', 0, 0, '1'), pin('2a', 40, 0, '2')],
  bounds: () => ({ x: -2, y: -22, w: 44, h: 28 }),
  Render: ({ visual }) => {
    const down = Boolean(visual && Number(visual.pressed));
    return (
      <g>
        {lead(0, 0, 10, 0)}
        {lead(30, 0, 40, 0)}
        <circle cx={10} cy={0} r={1.6} fill={INK} />
        <circle cx={30} cy={0} r={1.6} fill={INK} />
        <line x1={8} y1={down ? -2 : -7} x2={32} y2={down ? -2 : -7} stroke={INK} strokeWidth={SW} />
        <line x1={20} y1={down ? -2 : -7} x2={20} y2={-16} stroke={INK} strokeWidth={SW} />
        <line x1={15} y1={-16} x2={25} y2={-16} stroke={INK} strokeWidth={SW} />
      </g>
    );
  },
};

const SWITCH_SYM: Symbol = {
  pins: () => [pin('C', 0, 0, 'Común'), pin('1', 40, -10), pin('2', 40, 10)],
  bounds: () => ({ x: -2, y: -14, w: 44, h: 28 }),
  Render: ({ part }) => (
    <g>
      {lead(0, 0, 12, 0)}
      {lead(30, -10, 40, -10)}
      {lead(30, 10, 40, 10)}
      <circle cx={12} cy={0} r={1.6} fill={INK} />
      <circle cx={30} cy={-10} r={1.6} fill={INK} />
      <circle cx={30} cy={10} r={1.6} fill={INK} />
      <line x1={12} y1={0} x2={29} y2={part.props.on ? 8 : -8} stroke={INK} strokeWidth={SW} />
    </g>
  ),
};

const battery = (label: (p: Props) => string): Symbol => ({
  pins: () => [pin('+', 0, -30, '+'), pin('-', 0, 30, '−')],
  bounds: () => ({ x: -16, y: -32, w: 46, h: 64 }),
  Render: ({ part }) => (
    <g>
      {lead(0, -30, 0, -6)}
      {lead(0, 6, 0, 30)}
      <line x1={-11} y1={-5} x2={11} y2={-5} stroke={INK} strokeWidth={SW} />
      <line x1={-6} y1={0} x2={6} y2={0} stroke={INK} strokeWidth={SW + 1.4} />
      <line x1={-11} y1={5} x2={11} y2={5} stroke={INK} strokeWidth={SW} />
      <text x={-14} y={-10} fontSize="7" fill={INK} fontFamily={FONT}>
        +
      </text>
      <Name x={16} y={3} text={label(part.props)} anchor="start" />
    </g>
  ),
});

const transistor = (mos: boolean): Symbol => ({
  pins: () => (mos ? [pin('G', 0, 0, 'Puerta'), pin('D', 20, -20, 'Drenador'), pin('S', 20, 20, 'Fuente')] : [pin('B', 0, 0, 'Base'), pin('C', 20, -20, 'Colector'), pin('E', 20, 20, 'Emisor')]),
  bounds: () => ({ x: -2, y: -22, w: 36, h: 44 }),
  Render: () => (
    <g>
      <circle cx={14} cy={0} r={13} fill="none" stroke={INK} strokeWidth={1} />
      {mos ? (
        <g stroke={INK} strokeWidth={SW} fill="none">
          {lead(0, 0, 8, 0)}
          <line x1={8} y1={-7} x2={8} y2={7} />
          <line x1={11} y1={-8} x2={11} y2={8} />
          <path d="M11 -6 H20 V-20 M11 6 H20 V20 M11 0 H20 V6" />
          <path d="M14 0 l3 -2 v4 z" fill={INK} />
        </g>
      ) : (
        <g stroke={INK} strokeWidth={SW} fill="none">
          {lead(0, 0, 9, 0)}
          <line x1={9} y1={-8} x2={9} y2={8} />
          <path d="M9 -4 L20 -12 V-20 M9 4 L20 12 V20" />
          <path d="M20 12 l-5 -1 2 -3 z" fill={INK} />
        </g>
      )}
    </g>
  ),
});

const MOTOR_SYM: Symbol = twoPin(() => (
  <g>
    {lead(0, 0, 8, 0)}
    {lead(32, 0, 40, 0)}
    <circle cx={20} cy={0} r={12} fill="none" stroke={INK} strokeWidth={SW} />
    <text x={20} y={4} textAnchor="middle" fontSize="11" fontWeight={600} fill={INK} fontFamily={FONT}>
      M
    </text>
  </g>
), 40, 14);

const BUZZER_SYM: Symbol = {
  pins: () => [pin('+', 0, 0), pin('-', 30, 0, '−')],
  bounds: () => ({ x: -2, y: -16, w: 34, h: 24 }),
  Render: () => (
    <g>
      {lead(0, 0, 9, 0)}
      {lead(21, 0, 30, 0)}
      <path d="M9 0 V-6 H21 V0" fill="none" stroke={INK} strokeWidth={SW} />
      <path d="M7 -6 H23 L19 -14 H11 Z" fill="none" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
    </g>
  ),
};

/**
 * Caja genérica para placas y módulos: pines repartidos a izquierda y derecha. Con
 * `__pins` (lista de ids conectados) solo se dibujan esos, para que una placa de 70
 * pines no ocupe media pantalla.
 */
function boxSymbol(allPins: (props: Props) => PinDef[], title: string): Symbol {
  const visible = (props: Props) => {
    const list = allPins(props);
    const only = typeof props.__pins === 'string' ? new Set(props.__pins.split(',').filter(Boolean)) : null;
    if (!only || list.length <= 24) return list;
    const shown = only.size ? only : new Set(['5V', 'GND.1', 'D2', 'D9', 'A0']);
    return list.filter((p) => shown.has(p.id));
  };
  const layout = (props: Props) => {
    const pins = visible(props);
    const half = Math.ceil(pins.length / 2);
    const rows = Math.max(half, 1);
    const height = rows * 10 + 10;
    return {
      pins: pins.map((p, i) => (i < half ? pin(p.id, 0, 10 + i * 10, p.label) : pin(p.id, 80, 10 + (i - half) * 10, p.label))),
      height,
    };
  };
  return {
    pins: (props) => layout(props).pins,
    bounds: (props) => ({ x: -2, y: -12, w: 84, h: layout(props).height + 14 }),
    Render: ({ part }) => {
      const { pins, height } = layout(part.props);
      return (
        <g>
          <rect x={10} y={0} width={60} height={height} rx={2} fill="var(--sch-fill, rgba(255,255,255,0.02))" stroke={INK} strokeWidth={SW} />
          <text x={40} y={-4} textAnchor="middle" fontSize="7" fontWeight={600} fill={INK} fontFamily={FONT}>
            {title}
          </text>
          {pins.map((p) => (
            <g key={p.id}>
              {lead(p.x, p.y, p.x === 0 ? 10 : 70, p.y)}
              <text x={p.x === 0 ? 13 : 67} y={p.y + 2.2} textAnchor={p.x === 0 ? 'start' : 'end'} fontSize="5.6" fill={SOFT} fontFamily={FONT}>
                {p.id.replace(/\.\d+$/, '')}
              </text>
            </g>
          ))}
        </g>
      );
    },
  };
}

const SYMBOLS: Record<string, (orig: PartDef) => Symbol> = {
  'bench-supply': () => ({
    pins: () => [pin('-', 0, 0, 'Borne negativo'), pin('+', 60, 0, 'Borne positivo')],
    bounds: () => ({ x: -2, y: -30, w: 64, h: 48 }),
    Render: ({ part }) => <g>
      {lead(0, 0, 18, 0)}{lead(42, 0, 60, 0)}
      <circle cx={30} cy={0} r={12} fill="none" stroke={INK} strokeWidth={SW} />
      {lead(22, 0, 27, 0)}{lead(33, 0, 38, 0)}{lead(35.5, -2.5, 35.5, 2.5)}
      <Name x={30} y={-19} text={`${Number(part.props.voltage ?? 5)} V`} />
    </g>,
  }),
  resistor: () => RESISTOR,
  led: () => LED_SYM,
  diode: () => DIODE_SYM,
  capacitor: () => CAP_SYM,
  potentiometer: () => POT_SYM,
  ldr: () => LDR_SYM,
  pushbutton: () => BUTTON_SYM,
  'slide-switch': () => SWITCH_SYM,
  'battery-9v': () => battery((p) => `${Number(p.voltage ?? 9)} V`),
  'aa-pack': () => battery((p) => `${1.5 * Number(p.cells ?? 2)} V`),
  npn: () => transistor(false),
  'mosfet-n': () => transistor(true),
  'dc-motor': () => MOTOR_SYM,
  buzzer: () => BUZZER_SYM,
};

export const SCH_PREFIX = 'sch:';

/** Definición «sch:<tipo>» derivada de la pieza: mismos pines (ids), símbolo propio. */
export function schematicDef(orig: PartDef): PartDef {
  const sym = SYMBOLS[orig.type]?.(orig) ?? boxSymbol(orig.pins, orig.partNumber ?? orig.name.replace(/^Arduino /, ''));
  return {
    ...orig,
    type: SCH_PREFIX + orig.type,
    pins: (props) => {
      const original = new Map(orig.pins(props).map((p) => [p.id, p]));
      return sym.pins(props).map((p) => ({ ...p, label: original.get(p.id)?.label ?? p.label, desc: original.get(p.id)?.desc }));
    },
    bounds: sym.bounds,
    internal: undefined,
    Render: sym.Render,
  };
}
