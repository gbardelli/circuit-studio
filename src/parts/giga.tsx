// Arduino GIGA R1 WiFi: mismo formato y cabezales que la Mega, pero con un STM32H747XI a 3,3 V.
// El simulador no emula el Cortex-M7: ejecuta el sketch en un núcleo AVR con el mismo mapa de
// pines (D0–D53, A0–A11). Lo eléctrico sí es del GIGA: sus pines salen y leen a 3,3 V.
import { memo } from 'react';
import type { PinDef } from '../core/types';
import type { McuSpec, PartDef, RenderProps } from './types';
import { HEADER_Y, Header, mcuSim } from './arduino';
import { MEGA_PINS, MEGA_SIDE } from './boards';
import { Glow, Smd } from './common';

const FONT = 'Geist, sans-serif';
const range = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i));

// En el GIGA las posiciones A12–A15 de la Mega son DAC0, DAC1, CANRX y CANTX.
const RELABEL: Record<string, string> = { A12: 'DAC0', A13: 'DAC1', A14: 'CANRX', A15: 'CANTX', IOREF: 'IOREF', '5V': '5V' };

function describe(id: string): string {
  if (/^GND/.test(id)) return 'Tierra común del circuito (0 V).';
  if (/^5V/.test(id)) return 'Salida de 5 V (desde USB o VIN). Úsala solo para alimentar módulos, nunca hacia un pin de E/S.';
  if (id === '3V3') return 'Salida de 3,3 V: es el nivel lógico del GIGA. Alimenta aquí la lógica que hable con sus pines.';
  if (id === 'VIN') return 'Entrada de alimentación externa (6–24 V).';
  if (/^(RESET|RST)/.test(id)) return 'Reinicio del STM32H747, activo en nivel bajo.';
  if (id === 'IOREF') return 'Referencia del nivel lógico de la placa: 3,3 V.';
  if (id === 'AREF') return 'Referencia externa del conversor analógico-digital.';
  if (id === 'D20' || id === 'SDA') return 'SDA: datos del bus I²C (Wire). Lógica de 3,3 V.';
  if (id === 'D21' || id === 'SCL') return 'SCL: reloj del bus I²C (Wire). Lógica de 3,3 V.';
  if (id === 'D0') return 'RX0 (Serial1 en el GIGA). 3,3 V, no tolera 5 V.';
  if (id === 'D1') return 'TX0 (Serial1 en el GIGA). 3,3 V.';
  if (id === 'D18') return 'TX1: en el GIGA es Serial2 (en el simulador, Serial1). 3,3 V.';
  if (id === 'D19') return 'RX1: en el GIGA es Serial2 (en el simulador, Serial1). 3,3 V, no tolera 5 V.';
  if (/^A\d+$/.test(id)) return `Entrada analógica ${RELABEL[id] ?? id} (0–3,3 V).`;
  return `Entrada/salida digital ${id.slice(1)} a 3,3 V. No tolera 5 V: no la conectes a lógica de 5 V sin adaptar niveles.`;
}

const GIGA_PINS: PinDef[] = MEGA_PINS.map((pin) => ({ ...pin, label: RELABEL[pin.id] ?? pin.label, desc: describe(pin.id) }));

/** Pines del sketch; el perfil de emulación es el de la Mega (mismo orden de índices). */
const GIGA_MCU: McuSpec = {
  board: 'mega',
  fqbn: 'arduino:avr:mega:cpu=atmega2560',
  pinIds: [...range(54, (i) => `D${i}`), ...range(16, (i) => `A${i}`)],
  analogIds: range(16, (i) => `A${i}`),
  vio: 3.3,
};

const GigaRender = memo(function GigaRender({ visual }: RenderProps) {
  const l = Number(visual?.l ?? 0);
  const tx = Number(visual?.tx ?? 0);
  const on = visual != null;
  const T = HEADER_Y.top;
  const B = HEADER_Y.bottom;
  return (
    <g>
      <defs>
        <linearGradient id="giga-pcb" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#1f2428" />
          <stop offset="1" stopColor="#111417" />
        </linearGradient>
      </defs>
      <g filter="url(#f-shadow)">
        <path d="M4 0 H392 L400 8 V202 L392 210 H4 Q0 210 0 206 V4 Q0 0 4 0 Z" fill="url(#giga-pcb)" stroke="#05080a" strokeWidth={1} />
        <path d="M4 0 H392 L400 8 V202 L392 210 H4 Q0 210 0 206 V4 Q0 0 4 0 Z" fill="url(#p-epoxy)" opacity="0.35" />
        <path d="M5 1.5h386l7.5 7.5M1.5 5v199" stroke="#4fc3c3" strokeOpacity="0.35" strokeWidth="0.7" fill="none" />
      </g>
      {/* taladros */}
      {[
        [14, 104],
        [254, 18],
        [254, 168],
        [356, 104],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={5} fill="#c9b98a" />
          <circle cx={cx} cy={cy} r={3.2} fill="#0b0d0f" />
        </g>
      ))}
      {/* USB-C (programación) y USB-A (host) */}
      <rect x={-8} y={34} width={20} height={14} rx={6} fill="url(#g-metal)" stroke="#6b7177" strokeWidth={0.7} />
      <rect x={-5} y={38} width={14} height={6} rx={3} fill="#1a1c1f" />
      <rect x={-10} y={140} width={40} height={30} rx={1.5} fill="url(#g-metal)" stroke="#6b7177" strokeWidth={0.8} />
      <rect x={-8} y={146} width={34} height={18} rx={1} fill="#1d2b5c" />
      <rect x={-6} y={152} width={30} height={6} fill="#e8e8e8" opacity="0.85" />
      {/* jack de audio */}
      <rect x={-6} y={92} width={22} height={18} rx={3} fill="url(#g-black-plastic)" />
      <circle cx={-2} cy={101} r={4.2} fill="#0a0a0b" stroke="#3b3e42" strokeWidth={0.6} />
      {/* conector de cámara */}
      <rect x={300} y={58} width={46} height={10} rx={1} fill="#e9e4d6" />
      <rect x={302} y={60} width={42} height={6} fill="#2a2a2a" />
      {/* módulo WiFi/Bluetooth (Murata 1DX) */}
      <rect x={292} y={120} width={52} height={44} rx={2} fill="url(#g-metal)" stroke="#7d848b" strokeWidth={0.7} />
      <rect x={294} y={122} width={48} height={40} rx={1.5} fill="url(#p-brushed)" />
      <text x={318} y={140} textAnchor="middle" fontSize="5" fill="#3b4148" fontFamily={FONT} fontWeight={600}>
        WiFi · BT
      </text>
      <text x={318} y={148} textAnchor="middle" fontSize="4" fill="#4a5058" fontFamily={FONT}>
        Murata 1DX
      </text>
      {/* STM32H747XI */}
      <g>
        {range(28, (i) => String(i)).map((k, i) => (
          <g key={k} fill="url(#g-metal-v)">
            <rect x={178 + i * 2} y={66} width={0.9} height={4} />
            <rect x={178 + i * 2} y={130} width={0.9} height={4} />
            <rect x={172} y={72 + i * 2} width={4} height={0.9} />
            <rect x={234} y={72 + i * 2} width={4} height={0.9} />
          </g>
        ))}
        <rect x={176} y={70} width={58} height={60} rx={2} fill="url(#g-chip)" />
        <circle cx={181} cy={75} r={1.6} fill="#2c2e33" />
        <text x={205} y={96} textAnchor="middle" fontSize="5.4" fill="#c7ccd2" fontFamily={FONT} fontWeight={600}>
          STM32H747XI
        </text>
        <text x={205} y={104} textAnchor="middle" fontSize="4.2" fill="#9aa1a8" fontFamily={FONT}>
          M7 480 MHz · M4
        </text>
      </g>
      {[[48,93],[52,120],[64,136],[150,60],[150,140],[248,80],[262,96],[250,140],[276,150],[160,98]].map(([x,y],i) => <Smd key={i} x={x} y={y} ceramic={i%3===0} vertical={i%2===0} />)}
      <path d="M42 103h56l19 19h25M239 81h48M245 115h46M177 151v14h-55M56 124h42l10 10h29" stroke="#4fc3c3" strokeWidth="0.6" opacity="0.25" fill="none" />
      {/* botones BOOT y RST */}
      {[[26, 60, 'BOOT'], [26, 78, 'RST']].map(([x, y, t]) => (
        <g key={String(t)}>
          <rect x={Number(x)} y={Number(y)} width={10} height={8} rx={1.2} fill="url(#g-metal)" />
          <circle cx={Number(x) + 5} cy={Number(y) + 4} r={2.4} fill="#26292d" />
          <text x={Number(x) + 13} y={Number(y) + 6} fontSize="3.8" fill="#cfd6db" fontFamily={FONT}>
            {t}
          </text>
        </g>
      ))}
      {/* LEDs */}
      <g fontSize="4.6" fill="#e8f0f2" fontFamily={FONT}>
        <rect x={56} y={34} width={7} height={3.6} rx={0.8} fill={l > 0.05 ? '#ffb347' : '#6b5a3a'} />
        <Glow cx={59.5} cy={35.8} r={14} color="#ffae3d" intensity={l} />
        <text x={66} y={37.4}>L</text>
        <rect x={56} y={43} width={7} height={3.6} rx={0.8} fill={tx > 0.05 ? '#7ecbff' : '#3a5468'} />
        <text x={66} y={46.4}>TX</text>
        <rect x={270} y={96} width={7} height={3.6} rx={0.8} fill={on ? '#5cff8a' : '#2f6b44'} />
        <Glow cx={273.5} cy={97.8} r={12} color="#5cff8a" intensity={on ? 0.8 : 0} />
        <text x={266} y={99.4} textAnchor="end">ON</text>
      </g>
      {/* marca */}
      <text x={104} y={100} textAnchor="middle" fontSize="20" fontWeight={700} fill="#f1f5f6" fontFamily={FONT} letterSpacing="1.5">
        GIGA
      </text>
      <text x={104} y={112} textAnchor="middle" fontSize="5.6" fill="#4fc3c3" fontFamily={FONT} letterSpacing="0.8">
        R1 WiFi · 3,3 V
      </text>
      <g fontSize="5.2" fill="#aeb8bd" fontFamily={FONT} letterSpacing="0.6" textAnchor="middle">
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
      <rect x={365} y={5} width={20} height={190} rx={1} fill="url(#g-header)" />
      {MEGA_SIDE.map((pin) => (
        <rect key={pin.id} x={pin.x - 2} y={pin.y - 2} width={4} height={4} fill="#050505" stroke="#3d3d3d" strokeWidth={0.4} />
      ))}
      <g fontSize="4.4" fill="#f2fbfb" fontFamily={FONT} fontWeight={500}>
        {GIGA_PINS.filter((p) => p.y === T).map((p) => (
          <text key={p.id} x={p.x + 1.6} y={T + 8} transform={`rotate(-90 ${p.x + 1.6} ${T + 8})`} textAnchor="end">
            {p.label}
          </text>
        ))}
        {GIGA_PINS.filter((p) => p.y === B).map((p) => (
          <text key={p.id} x={p.x + 1.6} y={B - 8} transform={`rotate(-90 ${p.x + 1.6} ${B - 8})`} textAnchor="start">
            {p.label}
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

export const arduinoGiga: PartDef = {
  type: 'arduino-giga',
  name: 'Arduino GIGA R1 WiFi',
  partNumber: 'ABX00063',
  category: 'Placas',
  description:
    'STM32H747XI de doble núcleo (Cortex-M7 a 480 MHz + M4), formato Mega, WiFi y Bluetooth. Sus pines trabajan a 3,3 V y no toleran 5 V. ' +
    'En el simulador el sketch corre en un núcleo AVR con el mismo mapa de pines; para la placa real compila con «arduino:mbed_giga:giga».',
  keywords: ['arduino', 'giga', 'r1', 'wifi', 'stm32', 'stm32h747', 'cortex', 'm7', '3.3v', 'microcontrolador', 'mcu', 'placa'],
  defaults: {},
  mcu: GIGA_MCU,
  pins: () => GIGA_PINS,
  internal: () => [
    ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'],
    ['5V', '5V.2', '5V.3'],
    ['D20', 'SDA'],
    ['D21', 'SCL'],
  ],
  ground: ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'],
  bounds: () => ({ x: -10, y: 0, w: 410, h: 210 }),
  model: 'MCU',
  sim: (ctx) => mcuSim(ctx, GIGA_MCU),
  Render: GigaRender,
};
