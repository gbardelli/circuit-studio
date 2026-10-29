import { memo } from 'react';
import { Stamper, VSource, type Element } from '../core/solver';
import type { PinDef } from '../core/types';
import type { McuBridge, PartDef, RenderProps } from './types';
import { Glow } from './common';

// Cabezales hembra alineados a la rejilla de 0.1". Índices Arduino: D0–D13 = 0–13, A0–A5 = 14–19.
const TOP_Y = 12;
const BOTTOM_Y = 198;
const TOP: [string, number, string][] = [
  ['SCL', 70, 'SCL'],
  ['SDA', 80, 'SDA'],
  ['AREF', 90, 'AREF'],
  ['GND.1', 100, 'GND'],
  ['D13', 110, '13'],
  ['D12', 120, '12'],
  ['D11', 130, '~11'],
  ['D10', 140, '~10'],
  ['D9', 150, '~9'],
  ['D8', 160, '8'],
  ['D7', 180, '7'],
  ['D6', 190, '~6'],
  ['D5', 200, '~5'],
  ['D4', 210, '4'],
  ['D3', 220, '~3'],
  ['D2', 230, '2'],
  ['D1', 240, 'TX→1'],
  ['D0', 250, 'RX←0'],
];
const BOTTOM: [string, number, string][] = [
  ['IOREF', 90, 'IOREF'],
  ['RESET', 100, 'RESET'],
  ['3V3', 110, '3.3V'],
  ['5V', 120, '5V'],
  ['GND.2', 130, 'GND'],
  ['GND.3', 140, 'GND'],
  ['VIN', 150, 'Vin'],
  ['A0', 170, 'A0'],
  ['A1', 180, 'A1'],
  ['A2', 190, 'A2'],
  ['A3', 200, 'A3'],
  ['A4', 210, 'A4'],
  ['A5', 220, 'A5'],
];

export const MCU_PIN_IDS = [...Array.from({ length: 14 }, (_, i) => `D${i}`), 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];

const PINS: PinDef[] = [
  ...TOP.map(([id, x, label]) => ({ id, x, y: TOP_Y, kind: 'socket' as const, label })),
  ...BOTTOM.map(([id, x, label]) => ({ id, x, y: BOTTOM_Y, kind: 'socket' as const, label })),
];

/** Driver de un pin del ATmega328P según DDR/PORT. Resistencias aproximadas del datasheet. */
class McuPin implements Element {
  constructor(private node: number, private index: number, private mcu: McuBridge) {}
  stamp(s: Stamper) {
    const mode = this.mcu.running ? this.mcu.pinMode(this.index) : 'input';
    if (mode === 'high') {
      s.conductance(this.node, -1, 1 / 25);
      s.rhs(this.node, 5 / 25);
    } else if (mode === 'low') {
      s.conductance(this.node, -1, 1 / 25);
    } else if (mode === 'pullup') {
      s.conductance(this.node, -1, 1 / 35_000);
      s.rhs(this.node, 5 / 35_000);
    } else {
      s.conductance(this.node, -1, 1e-9);
    }
  }
}

function Header({ x, y, count }: { x: number; y: number; count: number }) {
  const w = count * 10;
  return (
    <g>
      <rect x={x - 5} y={y - 5} width={w} height={10} rx={1} fill="url(#g-header)" />
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} x={x - 2 + i * 10} y={y - 2} width={4} height={4} fill="#050505" stroke="#3d3d3d" strokeWidth={0.4} />
      ))}
    </g>
  );
}

const UnoRender = memo(function UnoRender({ visual }: RenderProps) {
  const l = Number(visual?.l ?? 0);
  const powered = visual != null;
  const tx = Number(visual?.tx ?? 0);
  return (
    <g>
      <g filter="url(#f-shadow)">
        <path d="M4 0 H262 L270 8 V196 L258 210 H4 Q0 210 0 206 V4 Q0 0 4 0 Z" fill="url(#g-pcb)" stroke="#06555b" strokeWidth={1} />
      </g>
      {/* agujeros de montaje */}
      {[
        [14, 104],
        [254, 18],
        [254, 168],
        [66, 196],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={5} fill="#d9d4c3" />
          <circle cx={cx} cy={cy} r={3.2} fill="#0b3d40" />
        </g>
      ))}
      {/* pistas decorativas */}
      <path d="M84 96 H112 V118 M150 52 V70 H230 M40 124 H92 V140" stroke="#0c7c83" strokeWidth={1.1} fill="none" opacity={0.6} />
      {/* USB-B */}
      <rect x={-8} y={30} width={46} height={40} rx={2} fill="url(#g-metal)" stroke="#6b7177" strokeWidth={0.8} />
      <rect x={-8} y={38} width={10} height={24} fill="#5d646b" />
      <rect x={-6} y={42} width={6} height={16} fill="#1d1f22" />
      {/* jack DC */}
      <rect x={-6} y={146} width={44} height={36} rx={3} fill="url(#g-black-plastic)" />
      <circle cx={6} cy={164} r={7} fill="#0b0b0c" />
      <circle cx={6} cy={164} r={2} fill="url(#g-metal)" />
      {/* regulador y condensadores */}
      <rect x={48} y={150} width={20} height={14} rx={1} fill="url(#g-chip)" />
      <rect x={52} y={146} width={12} height={4} fill="url(#g-metal)" />
      <circle cx={80} cy={162} r={7} fill="url(#g-metal-v)" stroke="#727a82" strokeWidth={0.6} />
      <circle cx={96} cy={162} r={7} fill="url(#g-metal-v)" stroke="#727a82" strokeWidth={0.6} />
      {/* ATmega16U2 */}
      <rect x={62} y={70} width={20} height={20} rx={1} fill="url(#g-chip)" transform="rotate(45 72 80)" />
      {/* cristal */}
      <rect x={64} y={124} width={30} height={10} rx={5} fill="url(#g-metal-v)" stroke="#727a82" strokeWidth={0.5} />
      {/* ATmega328P DIP-28 */}
      <g>
        {Array.from({ length: 14 }, (_, i) => (
          <g key={i}>
            <rect x={120 + i * 9.4} y={122} width={3.2} height={5} fill="url(#g-metal-v)" />
            <rect x={120 + i * 9.4} y={157} width={3.2} height={5} fill="url(#g-metal-v)" />
          </g>
        ))}
        <rect x={114} y={126} width={136} height={32} rx={2} fill="url(#g-chip)" />
        <path d="M114 138 a4 4 0 0 1 0 8" fill="#0b0b0c" />
        <circle cx={122} cy={152} r={1.6} fill="#2c2e33" />
        <text x={182} y={140} textAnchor="middle" fontSize="6" fill="#b8bcc2" fontFamily="Geist, sans-serif" letterSpacing="0.4">
          ATMEGA328P-PU
        </text>
        <text x={182} y={149} textAnchor="middle" fontSize="4.4" fill="#8b9097" fontFamily="Geist, sans-serif">
          16 MHz · 32 KB
        </text>
      </g>
      {/* botón de reset */}
      <rect x={18} y={6} width={18} height={18} rx={2} fill="url(#g-metal)" />
      <circle cx={27} cy={15} r={5.5} fill="#b23a2c" />
      {/* LEDs de placa */}
      {/* LEDs de placa, en columna junto al USB: ninguna etiqueta comparte espacio con los cabezales */}
      <g fontSize="4.6" fill="#e8f6f7" fontFamily="Geist, sans-serif">
        <rect x={44} y={34} width={7} height={3.6} rx={0.8} fill={l > 0.05 ? '#ffb347' : '#8a6d3b'} />
        <Glow cx={47.5} cy={35.8} r={14} color="#ffae3d" intensity={l} />
        <text x={54} y={37.4}>L</text>
        <rect x={44} y={43} width={7} height={3.6} rx={0.8} fill={tx > 0.05 ? '#ffd166' : '#8a6d3b'} />
        <Glow cx={47.5} cy={44.8} r={10} color="#ffd166" intensity={tx} />
        <text x={54} y={46.4}>TX</text>
        <rect x={44} y={52} width={7} height={3.6} rx={0.8} fill="#8a6d3b" />
        <text x={54} y={55.4}>RX</text>
        <rect x={240} y={96} width={7} height={3.6} rx={0.8} fill={powered ? '#5cff8a' : '#2f6b44'} />
        <Glow cx={243.5} cy={97.8} r={12} color="#5cff8a" intensity={powered ? 0.8 : 0} />
        <text x={236} y={99.4} textAnchor="end">ON</text>
      </g>
      {/* serigrafía */}
      <text x={176} y={98} textAnchor="middle" fontSize="21" fontWeight="700" fill="#e8f6f7" fontFamily="Geist, sans-serif" letterSpacing="-0.4">
        UNO
      </text>
      <text x={176} y={110} textAnchor="middle" fontSize="5.6" fill="#bfe3e5" fontFamily="Geist, sans-serif" letterSpacing="0.8">
        R3 · ATMEGA328P
      </text>
      <text x={215} y={46} textAnchor="middle" fontSize="5.2" fill="#bfe3e5" fontFamily="Geist, sans-serif" letterSpacing="0.6">
        DIGITAL · PWM ~
      </text>
      <text x={120} y={172} textAnchor="middle" fontSize="5.2" fill="#bfe3e5" fontFamily="Geist, sans-serif" letterSpacing="0.6">
        POWER
      </text>
      <text x={195} y={172} textAnchor="middle" fontSize="5.2" fill="#bfe3e5" fontFamily="Geist, sans-serif" letterSpacing="0.6">
        ANALOG IN
      </text>
      <Header x={70} y={TOP_Y} count={10} />
      <Header x={180} y={TOP_Y} count={8} />
      <Header x={90} y={BOTTOM_Y} count={7} />
      <Header x={170} y={BOTTOM_Y} count={6} />
      {/* Etiquetas giradas 90°: cada una ocupa su columna de 0.1" (ancho de línea 4.4 < 10). */}
      <g fontSize="4.4" fill="#f2fbfb" fontFamily="Geist, sans-serif" fontWeight={500}>
        {TOP.map(([id, x, label]) => (
          <text key={id} x={x + 1.6} y={TOP_Y + 8} transform={`rotate(-90 ${x + 1.6} ${TOP_Y + 8})`} textAnchor="end">
            {label}
          </text>
        ))}
        {BOTTOM.map(([id, x, label]) => (
          <text key={id} x={x + 1.6} y={BOTTOM_Y - 8} transform={`rotate(-90 ${x + 1.6} ${BOTTOM_Y - 8})`} textAnchor="start">
            {label}
          </text>
        ))}
      </g>
    </g>
  );
});

export const arduinoUno: PartDef = {
  type: 'arduino-uno',
  name: 'Arduino Uno R3',
  category: 'Placas',
  description: 'ATmega328P a 16 MHz emulado ciclo a ciclo (avr8js). Ejecuta tu sketch compilado.',
  keywords: ['arduino', 'uno', 'atmega328p', 'microcontrolador', 'mcu', 'placa'],
  defaults: {},
  pins: () => PINS,
  internal: () => [
    ['GND.1', 'GND.2', 'GND.3'],
    ['A4', 'SDA'],
    ['A5', 'SCL'],
  ],
  ground: ['GND.1', 'GND.2', 'GND.3'],
  bounds: () => ({ x: -8, y: 0, w: 278, h: 210 }),
  model: 'MCU',
  thumbScale: 0.62,
  sim(ctx) {
    const gnd = ctx.net('GND.1');
    const v5 = ctx.net('5V');
    const v33 = ctx.net('3V3');
    const elements: Element[] = [new VSource(v5, gnd, () => 5, () => 0.05), new VSource(v33, gnd, () => 3.3, () => 0.2)];
    const mcuNodes = MCU_PIN_IDS.map((id) => ctx.net(id));
    if (ctx.mcu) mcuNodes.forEach((node, i) => elements.push(new McuPin(node, i, ctx.mcu!)));
    const d13 = mcuNodes[13];
    return {
      elements,
      mcuNodes,
      probe: (v) => ({ l: (d13 < 0 ? 0 : v[d13]) > 2.5 ? 1 : 0 }),
    };
  },
  Render: UnoRender,
};
