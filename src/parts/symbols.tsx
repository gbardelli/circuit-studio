// Símbolos esquemáticos (IEC 60617) para la vista de esquema. Cada pieza del circuito se
// proyecta en una pieza «sch:<tipo>» con los mismos ids de pin; así selección, simulación y
// cables funcionan igual en las dos vistas.
import { createContext, useContext, type FC } from 'react';
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
/** Giro del símbolo en el esquema: con 180° los textos se dan la vuelta para leerse derechos. */
const Turned = createContext(0);
const upright = (turn: number, x: number, y: number) => (turn === 180 ? `rotate(180 ${x} ${y - 2.2})` : undefined);
const Name = ({ x, y, text, anchor = 'middle' }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end' }) => {
  const turn = useContext(Turned);
  const flipped = turn === 180 && anchor !== 'middle' ? (anchor === 'start' ? 'end' : 'start') : anchor;
  return (
    <text x={x} y={y} textAnchor={flipped} fontSize="6.5" fill={SOFT} fontFamily={FONT} transform={upright(turn, x, y)}>
      {text}
    </text>
  );
};
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
 * Símbolo funcional para integrados, placas y módulos (como en KiCad o Altium): entradas a la
 * izquierda, salidas a la derecha, cada puerta o biestable en su franja y la alimentación
 * implícita, anotada dentro de la caja. El esquema calcula las filas y las pasa en las props:
 * `__left` y `__right` (ids por fila, vacío = hueco), `__num` (número de patilla), `__power`
 * (nota de alimentación), `__ref` (designador). Sin ellas (vista previa), reparte los pines.
 */
function boxSymbol(allPins: (props: Props) => PinDef[], title: string): Symbol {
  const rows = (props: Props) => {
    if (typeof props.__left === 'string' && typeof props.__right === 'string') {
      const left = props.__left.split(',');
      const right = props.__right.split(',');
      const n = Math.max(left.length, right.length, 1);
      return { left: [...left, ...Array(n - left.length).fill('')], right: [...right, ...Array(n - right.length).fill('')], n };
    }
    const ids = allPins(props).map((p) => p.id);
    const half = Math.ceil(ids.length / 2);
    const left = ids.slice(0, half);
    const right = ids.slice(half);
    return { left, right: [...right, ...Array(left.length - right.length).fill('')], n: left.length };
  };
  const PITCH = 10;
  const shape = (props: Props) => {
    const r = rows(props);
    const names = new Map(allPins(props).map((p) => [p.id, pinName(p)]));
    const longest = (list: string[]) => Math.max(0, ...list.map((id) => (names.get(id) ?? '').length));
    const width = Math.max(50, Math.ceil(((longest(r.left) + longest(r.right)) * 3.7 + 22) / 10) * 10);
    return { ...r, names, width, height: r.n * PITCH + PITCH };
  };
  return {
    pins: (props) => {
      const { left, right, width } = shape(props);
      const out: PinDef[] = [];
      left.forEach((id, i) => id && out.push(pin(id, 0, PITCH + i * PITCH)));
      right.forEach((id, i) => id && out.push(pin(id, width + 20, PITCH + i * PITCH)));
      return out;
    },
    bounds: (props) => {
      const { width, height } = shape(props);
      return { x: -2, y: -16, w: width + 24, h: height + 16 + (props.__power ? 10 : 0) };
    },
    Render: ({ part }) => {
      const { left, right, names, width, height } = shape(part.props);
      const num = new Map(String(part.props.__num ?? '').split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
      const side = (list: string[], x: number, toward: number, anchor: 'start' | 'end') =>
        list.map(
          (id, i) =>
            id && (
              <g key={id}>
                {lead(x, PITCH + i * PITCH, toward, PITCH + i * PITCH)}
                <text x={anchor === 'start' ? toward + 3 : toward - 3} y={PITCH + i * PITCH + 2.1} textAnchor={anchor} fontSize="5.6" fill={INK} fontFamily={FONT}>
                  {names.get(id)}
                </text>
                {num.get(id) && (
                  <text x={(x + toward) / 2} y={PITCH + i * PITCH - 2} textAnchor="middle" fontSize="4.2" fill={SOFT} fontFamily={FONT}>
                    {num.get(id)}
                  </text>
                )}
              </g>
            ),
        );
      return (
        <g>
          <rect x={10} y={0} width={width} height={height} rx={1.5} fill="var(--sch-fill, rgba(255,255,255,0.025))" stroke={INK} strokeWidth={SW} />
          {part.props.__ref ? (
            <text x={10} y={-4} fontSize="6.6" fontWeight={600} fill={INK} fontFamily={FONT}>
              {String(part.props.__ref)}
            </text>
          ) : null}
          <text x={width + 10} y={-4} textAnchor="end" fontSize="6" fill={SOFT} fontFamily={FONT}>
            {title}
          </text>
          {side(left, 0, 10, 'start')}
          {side(right, width + 20, width + 10, 'end')}
          {part.props.__power ? (
            <text x={10 + width / 2} y={height + 8} textAnchor="middle" fontSize="4.6" fill={SOFT} fontFamily={FONT}>
              {String(part.props.__power)}
            </text>
          ) : null}
        </g>
      );
    },
  };
}

/** Nombre corto de la patilla tal como en la hoja de datos (Q̅, P̅L…), sin «· patilla n». */
function pinName(p: PinDef) {
  return (p.label ?? p.id).split(' · ')[0].replace(/.d+$/, '');
}

/** Interruptores DIP: cada uno en su fila, de nA (izquierda) a nB (derecha). */
const dipSymbol = (count: number): Symbol => ({
  pins: () => Array.from({ length: count }, (_, i) => [pin(`${i + 1}A`, 0, i * 20), pin(`${i + 1}B`, 40, i * 20)]).flat(),
  bounds: () => ({ x: -2, y: -16, w: 44, h: count * 20 + 12 }),
  Render: ({ part }) => (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const on = Boolean(part.props[`s${i + 1}`]);
        const y = i * 20;
        return (
          <g key={i}>
            {lead(0, y, 12, y)}
            {lead(28, y, 40, y)}
            <circle cx={12} cy={y} r={1.6} fill={INK} />
            <circle cx={28} cy={y} r={1.6} fill={INK} />
            <line x1={12} y1={y} x2={27} y2={on ? y - 1 : y - 7} stroke={INK} strokeWidth={SW} />
            <text x={20} y={y + 8} textAnchor="middle" fontSize="4.6" fill={SOFT} fontFamily={FONT}>
              {i + 1}
            </text>
          </g>
        );
      })}
    </g>
  ),
});

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
  'dip-switch-4': () => dipSymbol(4),
  'dip-switch-6': () => dipSymbol(6),
  'dip-switch-8': () => dipSymbol(8),
};

export const SCH_PREFIX = 'sch:';

/** Designador (R3, SW1…) en la esquina del símbolo discreto. */
function withRef(sym: Symbol): FC<RenderProps> {
  const Render = sym.Render;
  return function Discrete(props: RenderProps) {
    const ref = props.part.props.__ref;
    const b = sym.bounds(props.part.props);
    const turn = props.part.rot;
    // Con el símbolo girado 180°, el designador va en la esquina opuesta para quedar arriba a la izquierda.
    const rx = turn === 180 ? b.x + b.w - 2 : b.x + 2;
    const ry = turn === 180 ? b.y + b.h + 6 : b.y - 2;
    return (
      <Turned.Provider value={turn}>
        <g>
          <Render {...props} />
          {ref ? (
            <text x={rx} y={ry} fontSize="6.2" fontWeight={600} fill={INK} fontFamily={FONT} transform={upright(turn, rx, ry)}>
              {String(ref)}
            </text>
          ) : null}
        </g>
      </Turned.Provider>
    );
  };
}

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
    Render: SYMBOLS[orig.type] ? withRef(sym) : sym.Render,
  };
}
