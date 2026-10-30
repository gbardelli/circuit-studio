import { memo } from 'react';
import { Stamper, VSource, type Element } from '../core/solver';
import type { PinDef } from '../core/types';
import type { McuBridge, McuSpec, PartDef, PartSim, RenderProps, SimContext } from './types';
import { Glow, Smd } from './common';

// Cabezales hembra alineados a la rejilla de 0.1". Índices Arduino: D0–D13 = 0–13, A0–A5 = 14–19.
const TOP_Y = 10;
const BOTTOM_Y = 200;
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

export const TOP_HEADER = TOP;
export const BOTTOM_HEADER = BOTTOM;
export const HEADER_Y = { top: TOP_Y, bottom: BOTTOM_Y };

export const MCU_PIN_IDS = [...Array.from({ length: 14 }, (_, i) => `D${i}`), 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];

export function describeMcuPin(id: string, board: 'uno' | 'nano' | 'mega' = 'uno'): string {
  if (/^GND/.test(id)) return 'Tierra común del circuito (0 V).';
  if (/^5V/.test(id)) return 'Salida de alimentación regulada de 5 V.';
  if (id === '3V3') return 'Salida de alimentación de 3,3 V.';
  if (id === 'VIN') return 'Entrada de alimentación externa de la placa.';
  if (/^(RESET|RST)/.test(id)) return 'Reinicio del microcontrolador, activo en nivel bajo.';
  if (id === 'IOREF') return 'Referencia del nivel lógico de la placa: 5 V.';
  if (id === 'AREF') return 'Referencia externa del conversor analógico-digital.';
  if (id === 'SDA' || (board === 'mega' && id === 'D20')) return 'SDA: línea de datos del bus I²C.';
  if (id === 'SCL' || (board === 'mega' && id === 'D21')) return 'SCL: reloj del bus I²C.';
  if (/^A\d+$/.test(id)) return `Entrada analógica ${id}. Conversión de 10 bits en el rango de 0 a 5 V.`;
  const n = Number(id.slice(1));
  if (id === 'D0') return 'RX: recepción del puerto serie UART.';
  if (id === 'D1') return 'TX: transmisión del puerto serie UART.';
  const pwm = board === 'mega' ? (n >= 2 && n <= 13) || (n >= 44 && n <= 46) : [3, 5, 6, 9, 10, 11].includes(n);
  return `Entrada/salida digital ${n}, lógica de 5 V.${pwm ? ' Admite salida PWM con analogWrite().' : ''}`;
}

const PINS: PinDef[] = [
  ...TOP.map(([id, x, label]) => ({ id, x, y: TOP_Y, kind: 'socket' as const, label, desc: describeMcuPin(id) })),
  ...BOTTOM.map(([id, x, label]) => ({ id, x, y: BOTTOM_Y, kind: 'socket' as const, label, desc: describeMcuPin(id) })),
];

/** Driver de un pin del ATmega328P según DDR/PORT. Resistencias aproximadas del datasheet. */
export class McuPin implements Element {
  constructor(private node: number, private index: number, private mcu: McuBridge, private vio = 5) {}
  stamp(s: Stamper) {
    const mode = this.mcu.running ? this.mcu.pinMode(this.index) : 'input';
    if (mode === 'high') {
      s.conductance(this.node, -1, 1 / 25);
      s.rhs(this.node, this.vio / 25);
    } else if (mode === 'low') {
      s.conductance(this.node, -1, 1 / 25);
    } else if (mode === 'pullup') {
      s.conductance(this.node, -1, 1 / 35_000);
      s.rhs(this.node, this.vio / 35_000);
    } else {
      s.conductance(this.node, -1, 1e-9);
    }
  }
}

export function Header({ x, y, count }: { x: number; y: number; count: number }) {
  const w = count * 10;
  return (
    <g>
      <rect x={x - 5} y={y - 5} width={w} height={10} rx={1} fill="url(#g-header)" />
      <path d={`M${x-4} ${y-4.4}h${w-2}`} stroke="#777b7f" strokeWidth="0.45" strokeOpacity="0.5" />
      {Array.from({ length: count }, (_, i) => (
        <g key={i}>
          <rect x={x - 3 + i * 10} y={y - 3} width={6} height={6} rx="0.45" fill="#171a1c" stroke="#565a5c" strokeWidth="0.35" />
          <rect x={x - 2 + i * 10} y={y - 2} width={4} height={4} fill="#050607" />
          <path d={`M${x-1.3+i*10} ${y+1.4}h2.6`} stroke="#9e947d" strokeWidth="0.5" />
        </g>
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
        <path d="M4 0 H262 L270 8 V196 L258 210 H4 Q0 210 0 206 V4 Q0 0 4 0 Z" fill="url(#p-epoxy)" opacity="0.5" />
        <path d="M5 1.4H261l7.5 7.5M1.5 5v199" stroke="#83c5c3" strokeOpacity="0.55" strokeWidth="0.65" fill="none" />
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
      <path d="M86 52h25l15 15h86l12 12v34h19M93 56h17l15 16h80l13 13v29M41 114h63l8 8M102 168h10l8 8h118M87 86h12l16 16h14" fill="none" stroke="#70b7b1" strokeWidth="0.6" opacity="0.36" />
      {[[40,78],[41,90],[48,104],[88,91],[88,102],[101,79],[107,111],[48,174],[226,67],[223,88],[189,55],[207,55]].map(([x,y],i) => <Smd key={i} x={x} y={y} ceramic={i%3===0} vertical={i%4===0} />)}
      {/* USB-B */}
      <rect x={-8} y={30} width={46} height={40} rx={2} fill="url(#g-metal)" stroke="#6b7177" strokeWidth={0.8} />
      <rect x={-7} y={31} width={44} height={38} rx={1.5} fill="url(#p-brushed)" />
      <path d="M1 31v38M29 32v35M5 34h18v4H5zM5 61h18v4H5z" stroke="#6c747a" strokeWidth="0.7" fill="none" opacity="0.6" />
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
      <path d="M76 162h8M80 158v8M92 162h8M96 158v8" stroke="#747d83" strokeWidth="0.5" />
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
        <rect x={115} y={127} width={134} height={30} rx={1.4} fill="url(#p-epoxy)" />
        <path d="M116 127.3h132" stroke="#6b7176" strokeOpacity="0.5" strokeWidth="0.65" />
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

const UNO_MCU: McuSpec = {
  board: 'uno',
  fqbn: 'arduino:avr:uno',
  pinIds: MCU_PIN_IDS,
  analogIds: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
};

/**
 * Modelo eléctrico común a las placas: reguladores de 5 V y 3.3 V desde USB y un
 * driver por pin del microcontrolador. El LED «L» sigue a D13 (búfer en la placa).
 */
export function mcuSim(ctx: SimContext, spec: McuSpec, gndPin = 'GND.1'): PartSim {
  const gnd = ctx.net(gndPin);
  const elements: Element[] = [new VSource(ctx.net('5V'), gnd, () => 5, () => 0.05), new VSource(ctx.net('3V3'), gnd, () => 3.3, () => 0.2)];
  const mcuNodes = spec.pinIds.map((id) => ctx.net(id));
  const analogNodes = spec.analogIds.map((id) => ctx.net(id));
  if (ctx.mcu) mcuNodes.forEach((node, i) => elements.push(new McuPin(node, i, ctx.mcu!, spec.vio)));
  const d13 = mcuNodes[13];
  return { elements, mcuNodes, analogNodes, probe: (v) => ({ l: (d13 < 0 ? 0 : v[d13]) > (spec.vio ?? 5) / 2 ? 1 : 0 }) };
}

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
  mcu: UNO_MCU,
  sim: (ctx) => mcuSim(ctx, UNO_MCU),
  Render: UnoRender,
};
