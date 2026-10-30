import { memo } from 'react';
import type { PinDef } from '../core/types';
import type { McuSpec, PartDef, RenderProps } from './types';
import { BOTTOM_HEADER, HEADER_Y, Header, TOP_HEADER, mcuSim, describeMcuPin } from './arduino';
import { Glow, Smd } from './common';

const FONT = 'Geist, sans-serif';
const range = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i));

// ── Arduino Nano ─────────────────────────────────────────────────────────────
// Dos filas de 15 patillas separadas 0.6": se clava sobre el canal (filas c y g).
const NANO_TOP = ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND.1', 'RST.1', 'D0', 'D1'];
const NANO_BOTTOM = ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST.2', 'GND.2', 'VIN'];
const nanoLabel = (id: string) => ({ 'GND.1': 'GND', 'GND.2': 'GND', 'RST.1': 'RST', 'RST.2': 'RST', D0: 'RX0', D1: 'TX1', '3V3': '3V3', AREF: 'REF' })[id] ?? id.replace(/^D/, 'D');

const NANO_PINS: PinDef[] = [
  ...NANO_TOP.map((id, i) => ({ id, x: i * 10, y: 0, kind: 'leg' as const, label: nanoLabel(id), desc: describeMcuPin(id, 'nano') })),
  ...NANO_BOTTOM.map((id, i) => ({ id, x: i * 10, y: 60, kind: 'leg' as const, label: nanoLabel(id), desc: describeMcuPin(id, 'nano') })),
];

const NANO_MCU: McuSpec = {
  board: 'nano',
  fqbn: 'arduino:avr:nano:cpu=atmega328',
  pinIds: [...range(14, (i) => `D${i}`), 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
  analogIds: range(8, (i) => `A${i}`),
};

const NanoRender = memo(function NanoRender({ visual }: RenderProps) {
  const l = Number(visual?.l ?? 0);
  const tx = Number(visual?.tx ?? 0);
  const on = visual != null;
  return (
    <g>
      <g filter="url(#f-shadow)">
        <rect x={-8} y={-7} width={156} height={74} rx={3} fill="#1d4fa6" stroke="#123a80" strokeWidth={0.8} />
        <rect x={-7} y={-6} width={154} height={72} rx={2.5} fill="url(#g-sheen)" />
        <rect x={-7} y={-6} width={154} height={72} rx={2.5} fill="url(#p-epoxy)" opacity="0.6" />
        <path d="M-6 -5h151M-6 -5v70" stroke="#91b0d1" strokeOpacity="0.45" strokeWidth="0.5" />
      </g>
      {/* mini-USB */}
      <rect x={-22} y={20} width={20} height={20} rx={2} fill="url(#g-metal)" stroke="#6b7177" strokeWidth={0.6} />
      <rect x={-21} y={21} width={18} height={18} rx={1.5} fill="url(#p-brushed)" />
      <path d="M-17 22h9v3h-9zM-17 35h9v3h-9z" fill="#6c777e" opacity="0.65" />
      <rect x={-21} y={25} width={4} height={10} fill="#2a2d31" />
      {/* ATmega328P TQFP */}
      <g transform="rotate(45 62 30)">
        {range(8, (i) => String(i)).map((k, i) => (
          <g key={k} fill="url(#g-metal-v)">
            <rect x={51 + i * 3} y={16} width={1.4} height={3} />
            <rect x={51 + i * 3} y={41} width={1.4} height={3} />
            <rect x={48} y={19 + i * 3} width={3} height={1.4} />
            <rect x={73} y={19 + i * 3} width={3} height={1.4} />
          </g>
        ))}
        <rect x={51} y={19} width={22} height={22} rx={1} fill="url(#g-chip)" />
        <circle cx={54} cy={22} r={1} fill="#2c2e33" />
      </g>
      {/* cristal, botón de reset */}
      {[[34,14],[37,43],[86,16],[105,40],[131,42],[89,37]].map(([x,y],i) => <Smd key={i} x={x} y={y} ceramic={i%2===0} vertical={i%3===0} />)}
      <rect x={90} y={24} width={14} height={7} rx={3.5} fill="url(#g-metal-v)" />
      <rect x={112} y={22} width={14} height={14} rx={1.5} fill="url(#g-metal)" />
      <circle cx={119} cy={29} r={4} fill="#e8e8ea" />
      {/* LEDs */}
      <g fontFamily={FONT} fontSize="3.6" fill="#e6efff">
        <rect x={8} y={14} width={5} height={3} rx={0.6} fill={on ? '#5cff8a' : '#2f6b44'} />
        <Glow cx={10.5} cy={15.5} r={9} color="#5cff8a" intensity={on ? 0.7 : 0} />
        <text x={15} y={17}>PWR</text>
        <rect x={8} y={21} width={5} height={3} rx={0.6} fill={l > 0.05 ? '#ffb347' : '#8a6d3b'} />
        <Glow cx={10.5} cy={22.5} r={10} color="#ffae3d" intensity={l} />
        <text x={15} y={24}>L</text>
        <rect x={8} y={36} width={5} height={3} rx={0.6} fill={tx > 0.05 ? '#ffd166' : '#8a6d3b'} />
        <text x={15} y={39}>TX</text>
        <rect x={8} y={43} width={5} height={3} rx={0.6} fill="#8a6d3b" />
        <text x={15} y={46}>RX</text>
      </g>
      <text x={98} y={47} fontFamily={FONT} fontSize="7.5" fontWeight={700} fill="#f2f6ff" letterSpacing="-0.2">
        NANO
      </text>
      {/* pads y etiquetas */}
      {NANO_PINS.map((pin) => (
        <g key={pin.id}>
          <circle cx={pin.x} cy={pin.y} r={3.2} fill="#d7b65a" />
          <circle cx={pin.x} cy={pin.y} r={1.5} fill="#2a2414" />
        </g>
      ))}
      <g fontFamily={FONT} fontSize="3.3" fill="#f2f6ff" fontWeight={500} textAnchor="middle">
        {NANO_PINS.map((pin) => (
          <text key={pin.id} x={pin.x} y={pin.y === 0 ? 8.6 : 54.8}>
            {pin.label}
          </text>
        ))}
      </g>
    </g>
  );
});

export const arduinoNano: PartDef = {
  type: 'arduino-nano',
  name: 'Arduino Nano',
  category: 'Placas',
  description: 'ATmega328P en formato DIP: se clava directamente en la protoboard, sobre el canal central.',
  keywords: ['arduino', 'nano', 'atmega328p', 'microcontrolador', 'mcu', 'placa'],
  defaults: {},
  mcu: NANO_MCU,
  pins: () => NANO_PINS,
  internal: () => [
    ['GND.1', 'GND.2'],
    ['RST.1', 'RST.2'],
  ],
  ground: ['GND.1', 'GND.2'],
  bounds: () => ({ x: -22, y: -7, w: 174, h: 74 }),
  model: 'MCU',
  sim: (ctx) => mcuSim(ctx, NANO_MCU),
  Render: NanoRender,
};

// ── Arduino Mega 2560 ────────────────────────────────────────────────────────
const MEGA_COMM: [string, number, string][] = [
  ['D14', 270, 'TX3 14'],
  ['D15', 280, 'RX3 15'],
  ['D16', 290, 'TX2 16'],
  ['D17', 300, 'RX2 17'],
  ['D18', 310, 'TX1 18'],
  ['D19', 320, 'RX1 19'],
  ['D20', 330, 'SDA 20'],
  ['D21', 340, 'SCL 21'],
];
const MEGA_ANALOG_HI: [string, number, string][] = range(8, (i) => `A${i + 8}`).map((id, i) => [id, 260 + i * 10, id]);
const MEGA_BOTTOM: [string, number, string][] = [...BOTTOM_HEADER.filter(([id]) => !/^A[45]$/.test(id)), ['A4', 210, 'A4'], ['A5', 220, 'A5'], ['A6', 230, 'A6'], ['A7', 240, 'A7'], ...MEGA_ANALOG_HI];
// Cabezal doble del lateral: pares en x = 370, impares en x = 380; 5 V arriba y GND abajo.
export const MEGA_SIDE: PinDef[] = [
  { id: '5V.2', x: 370, y: 10, kind: 'socket', label: '5V' },
  { id: '5V.3', x: 380, y: 10, kind: 'socket', label: '5V' },
  ...range(16, (r) => String(r)).flatMap((_, r) => [
    { id: `D${22 + r * 2}`, x: 370, y: 20 + r * 10, kind: 'socket' as const, label: String(22 + r * 2) },
    { id: `D${23 + r * 2}`, x: 380, y: 20 + r * 10, kind: 'socket' as const, label: String(23 + r * 2) },
  ]),
  { id: 'GND.4', x: 370, y: 190, kind: 'socket', label: 'GND' },
  { id: 'GND.5', x: 380, y: 190, kind: 'socket', label: 'GND' },
];
export const MEGA_PINS: PinDef[] = [
  ...[...TOP_HEADER, ...MEGA_COMM].map(([id, x, label]) => ({ id, x, y: HEADER_Y.top, kind: 'socket' as const, label })),
  ...MEGA_BOTTOM.map(([id, x, label]) => ({ id, x, y: HEADER_Y.bottom, kind: 'socket' as const, label })),
  ...MEGA_SIDE,
].map((pin) => ({ ...pin, desc: describeMcuPin(pin.id, 'mega') }));

const MEGA_MCU: McuSpec = {
  board: 'mega',
  fqbn: 'arduino:avr:mega:cpu=atmega2560',
  pinIds: [...range(54, (i) => `D${i}`), ...range(16, (i) => `A${i}`)],
  analogIds: range(16, (i) => `A${i}`),
};

const MegaRender = memo(function MegaRender({ visual }: RenderProps) {
  const l = Number(visual?.l ?? 0);
  const tx = Number(visual?.tx ?? 0);
  const on = visual != null;
  const T = HEADER_Y.top;
  const B = HEADER_Y.bottom;
  return (
    <g>
      <g filter="url(#f-shadow)">
        <path d="M4 0 H392 L400 8 V202 L392 210 H4 Q0 210 0 206 V4 Q0 0 4 0 Z" fill="url(#g-pcb)" stroke="#06555b" strokeWidth={1} />
        <path d="M4 0 H392 L400 8 V202 L392 210 H4 Q0 210 0 206 V4 Q0 0 4 0 Z" fill="url(#p-epoxy)" opacity="0.5" />
        <path d="M5 1.5h386l7.5 7.5M1.5 5v199" stroke="#83c5c3" strokeOpacity="0.5" strokeWidth="0.7" fill="none" />
      </g>
      {[
        [14, 104],
        [254, 18],
        [254, 168],
        [356, 104],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={5} fill="#d9d4c3" />
          <circle cx={cx} cy={cy} r={3.2} fill="#0b3d40" />
        </g>
      ))}
      <rect x={-8} y={30} width={46} height={40} rx={2} fill="url(#g-metal)" stroke="#6b7177" strokeWidth={0.8} />
      <rect x={-7} y={31} width={44} height={38} rx={1.5} fill="url(#p-brushed)" />
      <path d="M42 103h56l19 19h25M239 81h48l18 -18h45M245 115h46l17 17h42M245 128h38l24 24h43M177 151v14h-55M56 124h42l10 10h29" stroke="#69b2ad" strokeWidth="0.7" opacity="0.4" fill="none" />
      {[[48,93],[50,115],[60,140],[82,142],[100,56],[123,57],[146,57],[258,83],[277,97],[254,141],[281,152],[314,83],[332,111],[318,145]].map(([x,y],i) => <Smd key={i} x={x} y={y} ceramic={i%3===0} vertical={i%2===0} />)}
      <rect x={-8} y={38} width={10} height={24} fill="#5d646b" />
      <rect x={-6} y={146} width={44} height={36} rx={3} fill="url(#g-black-plastic)" />
      <circle cx={6} cy={164} r={7} fill="#0b0b0c" />
      <rect x={18} y={6} width={18} height={18} rx={2} fill="url(#g-metal)" />
      <circle cx={27} cy={15} r={5.5} fill="#b23a2c" />
      {/* ATmega2560 TQFP-100 */}
      <g transform="rotate(45 200 112)">
        {range(25, (i) => String(i)).map((k, i) => (
          <g key={k} fill="url(#g-metal-v)">
            <rect x={179 + i * 1.7} y={86} width={0.85} height={4} />
            <rect x={179 + i * 1.7} y={134} width={0.85} height={4} />
            <rect x={174} y={91 + i * 1.7} width={4} height={0.85} />
            <rect x={222} y={91 + i * 1.7} width={4} height={0.85} />
          </g>
        ))}
        <rect x={178} y={90} width={44} height={44} rx={1.5} fill="url(#g-chip)" />
        <circle cx={182} cy={94} r={1.4} fill="#2c2e33" />
      </g>
      <text x={200} y={104} textAnchor="middle" fontSize="4.6" fill="#b8bcc2" fontFamily={FONT} transform="rotate(45 200 112)">
        ATMEGA2560
      </text>
      <g fontSize="4.6" fill="#e8f6f7" fontFamily={FONT}>
        <rect x={44} y={34} width={7} height={3.6} rx={0.8} fill={l > 0.05 ? '#ffb347' : '#8a6d3b'} />
        <Glow cx={47.5} cy={35.8} r={14} color="#ffae3d" intensity={l} />
        <text x={54} y={37.4}>L</text>
        <rect x={44} y={43} width={7} height={3.6} rx={0.8} fill={tx > 0.05 ? '#ffd166' : '#8a6d3b'} />
        <text x={54} y={46.4}>TX</text>
        <rect x={44} y={52} width={7} height={3.6} rx={0.8} fill="#8a6d3b" />
        <text x={54} y={55.4}>RX</text>
        <rect x={300} y={96} width={7} height={3.6} rx={0.8} fill={on ? '#5cff8a' : '#2f6b44'} />
        <Glow cx={303.5} cy={97.8} r={12} color="#5cff8a" intensity={on ? 0.8 : 0} />
        <text x={296} y={99.4} textAnchor="end">ON</text>
      </g>
      <text x={110} y={100} textAnchor="middle" fontSize="19" fontWeight={700} fill="#e8f6f7" fontFamily={FONT} letterSpacing="-0.4">
        MEGA
      </text>
      <text x={110} y={112} textAnchor="middle" fontSize="5.6" fill="#bfe3e5" fontFamily={FONT} letterSpacing="0.8">
        2560 · R3
      </text>
      <g fontSize="5.2" fill="#bfe3e5" fontFamily={FONT} letterSpacing="0.6" textAnchor="middle">
        <text x={215} y={46}>PWM ~</text>
        <text x={305} y={46}>COMUNICACIÓN</text>
        <text x={120} y={172}>POWER</text>
        <text x={250} y={172}>ANALOG IN</text>
      </g>
      <Header x={70} y={T} count={10} />
      <Header x={180} y={T} count={8} />
      <Header x={270} y={T} count={8} />
      <Header x={90} y={B} count={7} />
      <Header x={170} y={B} count={8} />
      <Header x={260} y={B} count={8} />
      {/* cabezal doble lateral */}
      <rect x={365} y={5} width={20} height={190} rx={1} fill="url(#g-header)" />
      {MEGA_SIDE.map((pin) => (
        <rect key={pin.id} x={pin.x - 2} y={pin.y - 2} width={4} height={4} fill="#050505" stroke="#3d3d3d" strokeWidth={0.4} />
      ))}
      <g fontSize="4.4" fill="#f2fbfb" fontFamily={FONT} fontWeight={500}>
        {[...TOP_HEADER, ...MEGA_COMM].map(([id, x, label]) => (
          <text key={id} x={x + 1.6} y={T + 8} transform={`rotate(-90 ${x + 1.6} ${T + 8})`} textAnchor="end">
            {label}
          </text>
        ))}
        {MEGA_BOTTOM.map(([id, x, label]) => (
          <text key={id} x={x + 1.6} y={B - 8} transform={`rotate(-90 ${x + 1.6} ${B - 8})`} textAnchor="start">
            {label}
          </text>
        ))}
        {MEGA_SIDE.map((pin) => (
          <text key={pin.id} x={pin.x === 370 ? 362 : 388} y={pin.y + 1.6} textAnchor={pin.x === 370 ? 'end' : 'start'} fontSize="4">
            {pin.label}
          </text>
        ))}
      </g>
    </g>
  );
});

export const arduinoMega: PartDef = {
  type: 'arduino-mega',
  name: 'Arduino Mega 2560',
  category: 'Placas',
  description: 'ATmega2560: 54 pines digitales (15 PWM), 16 analógicos, 4 puertos serie y 256 KB de flash.',
  keywords: ['arduino', 'mega', '2560', 'atmega2560', 'microcontrolador', 'mcu', 'placa'],
  defaults: {},
  mcu: MEGA_MCU,
  pins: () => MEGA_PINS,
  internal: () => [
    ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'],
    ['5V', '5V.2', '5V.3'],
    ['D20', 'SDA'],
    ['D21', 'SCL'],
  ],
  ground: ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'],
  bounds: () => ({ x: -8, y: 0, w: 408, h: 210 }),
  model: 'MCU',
  sim: (ctx) => mcuSim(ctx, MEGA_MCU),
  Render: MegaRender,
};
