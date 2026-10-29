import { memo } from 'react';
import { Diode, NMOS, Resistor, VSource, type Element } from '../core/solver';
import { Hd44780 } from '../sim/hd44780';
import type { PartDef, RenderProps, SimContext } from './types';
import { Glow, Leg, Screw, Smd } from './common';

const FONT = 'Geist, sans-serif';
const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const volt = (v: Float64Array, n: number) => (n < 0 ? 0 : v[n]);

// ── Diodo 1N4007 ─────────────────────────────────────────────────────────────
const DiodeRender = memo(function DiodeRender() {
  return (
    <g>
      <line x1={0} y1={0} x2={40} y2={0} stroke="#a8afb6" strokeWidth={1.6} strokeLinecap="round" />
      <rect x={11} y={-5.5} width={18} height={11} rx={2.5} fill="url(#g-black-plastic)" />
      <path d="M13 -4h13" stroke="#a3a9ae" strokeWidth="0.45" strokeOpacity="0.4" />
      <rect x={25} y={-5.5} width={2.6} height={11} fill="#c9ced4" />
      <text x={18} y={1.6} textAnchor="middle" fontSize="3.2" fill="#9aa0a8" fontFamily={FONT}>
        4007
      </text>
    </g>
  );
});

export const diode: PartDef = {
  type: 'diode',
  name: 'Diodo 1N4007',
  category: 'Semiconductores',
  description: 'Rectificador de 1 A. La franja marca el cátodo. Úsalo como diodo de protección en relés y motores.',
  keywords: ['diodo', '1n4007', 'rectificador', 'proteccion', 'flyback'],
  defaults: {},
  pins: () => [
    { id: 'A', x: 0, y: 0, kind: 'leg', label: 'Ánodo' },
    { id: 'K', x: 40, y: 0, kind: 'leg', label: 'Cátodo' },
  ],
  bounds: () => ({ x: -2, y: -7, w: 44, h: 14 }),
  model: 'SPICE',
  sim(ctx) {
    const d = new Diode(ctx.net('A'), ctx.net('K'), 1e-9, 1.9);
    return { elements: [d], probe: (v) => ({ i: Math.max(0, d.currentOf(v)) }) };
  },
  Render: DiodeRender,
};

// ── MOSFET IRLZ44N (nivel lógico) ────────────────────────────────────────────
const MosfetRender = memo(function MosfetRender() {
  return (
    <g>
      <Leg x={0} y0={-12} y1={0} w={2} />
      <Leg x={10} y0={-12} y1={0} w={2} />
      <Leg x={20} y0={-12} y1={0} w={2} />
      <rect x={-6} y={-58} width={32} height={24} rx={2} fill="url(#g-metal)" stroke="#727a82" strokeWidth={0.5} />
      <circle cx={10} cy={-48} r={4} fill="#3a3f45" />
      <rect x={-6} y={-36} width={32} height={26} rx={1.5} fill="url(#g-black-plastic)" />
      <rect x={-5} y={-35} width={30} height={24} rx={1} fill="url(#p-epoxy)" />
      <text x={10} y={-25} textAnchor="middle" fontSize="4.4" fill="#c9cbd1" fontFamily={FONT}>
        IRLZ44N
      </text>
      <g fontSize="4" fill="#667" textAnchor="middle" fontFamily={FONT}>
        <text x={0} y={7}>G</text>
        <text x={10} y={7}>D</text>
        <text x={20} y={7}>S</text>
      </g>
    </g>
  );
});

export const mosfet: PartDef = {
  type: 'mosfet-n',
  name: 'MOSFET N IRLZ44N',
  category: 'Semiconductores',
  description: 'MOSFET de nivel lógico: con 5 V en la puerta conmuta motores y tiras LED. Patillas G-D-S.',
  keywords: ['mosfet', 'irlz44n', 'transistor', 'n', 'potencia', 'conmutacion'],
  defaults: {},
  pins: () => [
    { id: 'G', x: 0, y: 0, kind: 'leg', label: 'Puerta' },
    { id: 'D', x: 10, y: 0, kind: 'leg', label: 'Drenador' },
    { id: 'S', x: 20, y: 0, kind: 'leg', label: 'Fuente' },
  ],
  bounds: () => ({ x: -7, y: -59, w: 34, h: 68 }),
  model: 'SPICE',
  sim(ctx) {
    const d = ctx.net('D');
    const s = ctx.net('S');
    const q = new NMOS(d, ctx.net('G'), s);
    return { elements: [q, new Diode(s, d, 1e-12, 1.7)], probe: (v) => ({ i: Math.abs(q.currentOf(v)) }) };
  },
  Render: MosfetRender,
};

// ── Sensor de temperatura TMP36 ─────────────────────────────────────────────
const Tmp36Render = memo(function Tmp36Render({ part }: RenderProps) {
  const t = num(part.props.temperature, 25);
  return (
    <g>
      <Leg x={0} y0={-12} y1={0} />
      <Leg x={10} y0={-12} y1={0} />
      <Leg x={20} y0={-12} y1={0} />
      <path d="M-4 -12 H24 V-30 A14 10 0 0 0 -4 -30 Z" fill="url(#g-black-plastic)" />
      <text x={10} y={-22} fontSize="4.6" fill="#c9cbd1" textAnchor="middle" fontFamily={FONT}>
        TMP36
      </text>
      <text x={10} y={-44} fontSize="6" fill="#f2a65a" textAnchor="middle" fontWeight={600} fontFamily={FONT}>
        {Math.round(t)} °C
      </text>
      <g fontSize="4" fill="#667" textAnchor="middle" fontFamily={FONT}>
        <text x={0} y={7}>+</text>
        <text x={10} y={7}>Vo</text>
        <text x={20} y={7}>−</text>
      </g>
    </g>
  );
});

export const tmp36: PartDef = {
  type: 'tmp36',
  name: 'Sensor de temperatura TMP36',
  category: 'Entradas',
  description: 'Salida analógica: 0.5 V a 0 °C y 10 mV por grado. Ajusta la temperatura en el inspector.',
  keywords: ['temperatura', 'tmp36', 'sensor', 'termometro', 'analogico'],
  defaults: { temperature: 25 },
  pins: () => [
    { id: '+Vs', x: 0, y: 0, kind: 'leg', label: '+Vs' },
    { id: 'OUT', x: 10, y: 0, kind: 'leg', label: 'Vout' },
    { id: 'GND', x: 20, y: 0, kind: 'leg', label: 'GND' },
  ],
  bounds: () => ({ x: -5, y: -52, w: 30, h: 61 }),
  fields: [{ key: 'temperature', label: 'Temperatura', kind: 'range', min: -40, max: 125, step: 1, unit: '°C' }],
  model: 'Comportamental',
  sim(ctx) {
    const vs = ctx.net('+Vs');
    const gnd = ctx.net('GND');
    let supply = 0;
    const out = new VSource(ctx.net('OUT'), gnd, () => (supply > 2.7 ? 0.5 + 0.01 * num(ctx.props.temperature, 25) : 0), () => 50);
    return {
      elements: [new Resistor(vs, gnd, () => 100_000), out],
      tracker: {
        sample: (v) => {
          supply = volt(v, vs) - volt(v, gnd);
        },
        read: () => ({}),
      },
    };
  },
  Render: Tmp36Render,
};

// ── Sensor ultrasónico HC-SR04 ──────────────────────────────────────────────
const SonarRender = memo(function SonarRender({ part, visual }: RenderProps) {
  const cm = num(part.props.distance, 100);
  const echo = Boolean(visual?.echo);
  return (
    <g>
      {[0, 10, 20, 30].map((x) => (
        <Leg key={x} x={x} y0={-10} y1={0} />
      ))}
      <g filter="url(#f-shadow)">
        <rect x={-72} y={-92} width={174} height={84} rx={3} fill="#1f5fbf" stroke="#14438c" strokeWidth={0.8} />
      </g>
      {[-30, 60].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={-52} r={30} fill="url(#g-metal)" stroke="#6b7177" strokeWidth={0.8} />
          <circle cx={cx} cy={-52} r={26.5} fill="none" stroke="#edf0f0" strokeWidth="0.75" />
          <circle cx={cx} cy={-52} r={24} fill="url(#p-mesh)" stroke="#171c20" strokeWidth="2" />
          {Array.from({ length: 5 }, (_, i) => (
            <circle key={i} cx={cx} cy={-52} r={4 + i * 4} fill="none" stroke="#3a3d42" strokeWidth={0.6} />
          ))}
        </g>
      ))}
      <rect x={6} y={-80} width={18} height={10} rx={1} fill="url(#g-metal-v)" />
      <text x={15} y={-56} textAnchor="middle" fontSize="6" fontWeight={700} fill="#eaf1ff" fontFamily={FONT}>
        HC-SR04
      </text>
      <text x={15} y={-46} textAnchor="middle" fontSize="5" fill="#bcd2ff" fontFamily={FONT}>
        {cm} cm
      </text>
      {echo && (
        <g stroke="#7cc4ff" strokeWidth={1.2} fill="none" opacity={0.8} strokeLinecap="round">
          <path d="M-46 -98 a20 10 0 0 1 32 0" />
          <path d="M-52 -106 a28 14 0 0 1 44 0" />
        </g>
      )}
      <g fontSize="3.8" fill="#eaf1ff" textAnchor="middle" fontFamily={FONT}>
        <text x={0} y={-13}>Vcc</text>
        <text x={10} y={-13}>Trig</text>
        <text x={20} y={-13}>Echo</text>
        <text x={30} y={-13}>Gnd</text>
      </g>
    </g>
  );
});

export const hcsr04: PartDef = {
  type: 'hc-sr04',
  name: 'Sensor ultrasónico HC-SR04',
  category: 'Entradas',
  description: 'Mide distancias de 2 a 400 cm: un pulso de 10 µs en Trig devuelve en Echo 58 µs por centímetro.',
  keywords: ['ultrasonido', 'hc-sr04', 'distancia', 'sonar', 'sensor', 'pulsein'],
  defaults: { distance: 100 },
  pins: () => [
    { id: 'VCC', x: 0, y: 0, kind: 'leg', label: 'Vcc' },
    { id: 'TRIG', x: 10, y: 0, kind: 'leg', label: 'Trig' },
    { id: 'ECHO', x: 20, y: 0, kind: 'leg', label: 'Echo' },
    { id: 'GND', x: 30, y: 0, kind: 'leg', label: 'Gnd' },
  ],
  bounds: () => ({ x: -73, y: -108, w: 176, h: 109 }),
  fields: [{ key: 'distance', label: 'Distancia', kind: 'range', min: 2, max: 400, step: 1, unit: 'cm' }],
  model: 'Comportamental',
  sim(ctx: SimContext) {
    const vcc = ctx.net('VCC');
    const gnd = ctx.net('GND');
    const trig = ctx.net('TRIG');
    let t = 0;
    let trigHigh = false;
    let trigSince = 0;
    let echo = false;
    let echoAt: number | null = null;
    let echoEnd = 0;
    let supply = 0;
    let dirty = false;
    const out = new VSource(ctx.net('ECHO'), gnd, () => (echo && supply > 4.5 ? 5 : 0), () => 100);
    return {
      elements: [new Resistor(vcc, gnd, () => 2500), new Resistor(trig, gnd, () => 10_000), out],
      nextEvent: () => (echoAt ?? (echo ? echoEnd : null)),
      changed: () => {
        const d = dirty;
        dirty = false;
        return d;
      },
      tracker: {
        sample(v, dt) {
          t += dt;
          supply = volt(v, vcc) - volt(v, gnd);
          const high = volt(v, trig) - volt(v, gnd) > 2.5;
          if (high && !trigHigh) trigSince = t - dt;
          // Pulso de disparo ≥ 10 µs: 8 ciclos de 40 kHz (200 µs) y luego el eco.
          if (!high && trigHigh && t - trigSince >= 9e-6 && !echo && echoAt === null) echoAt = t + 200e-6;
          trigHigh = high;
          if (echoAt !== null && t >= echoAt - 1e-9) {
            echo = true;
            echoAt = null;
            echoEnd = t + num(ctx.props.distance, 100) * 58e-6;
            dirty = true;
          } else if (echo && t >= echoEnd - 1e-9) {
            echo = false;
            dirty = true;
          }
        },
        read: () => ({ echo }),
      },
    };
  },
  Render: SonarRender,
};

// ── Módulo de relé ───────────────────────────────────────────────────────────
const RelayRender = memo(function RelayRender({ part, visual }: RenderProps) {
  const on = Boolean(visual?.on);
  return (
    <g>
      {[0, 10, 20].map((x) => (
        <Leg key={x} x={x} y0={-8} y1={0} />
      ))}
      <g filter="url(#f-shadow)">
        <rect x={-14} y={-76} width={136} height={68} rx={3} fill="#1f5fbf" stroke="#14438c" strokeWidth={0.8} />
      </g>
      <rect x={22} y={-70} width={56} height={46} rx={2} fill="#2f6fe0" stroke="#1b4fae" strokeWidth={0.8} />
      <rect x={23} y={-69} width={54} height={44} rx={1.5} fill="url(#g-sheen)" />
      <path d="M24 -68h52M24 -68v41" stroke="#b1d1ff" strokeOpacity="0.35" strokeWidth="0.7" />
      <path d="M24 -27h52" stroke="#123e8e" strokeWidth="1" />
      <Smd x={4} y={-44} vertical ceramic /><Smd x={8} y={-58} vertical />
      <text x={50} y={-50} textAnchor="middle" fontSize="5.4" fontWeight={700} fill="#eaf1ff" fontFamily={FONT}>
        SRD-05VDC
      </text>
      <text x={50} y={-42} textAnchor="middle" fontSize="4" fill="#cfe0ff" fontFamily={FONT}>
        10A 250VAC
      </text>
      <rect x={84} y={-72} width={34} height={22} rx={2} fill="#2e8f4f" />
      <path d="M85 -71h32M95 -71v20M105 -71v20" stroke="#65ba7b" strokeWidth="0.55" />
      {[90, 100, 110].map((x) => (
        <g key={x}>
          <circle cx={x} cy={-60} r={3.6} fill="url(#g-metal)" />
          <path d={`M${x - 2.2} -60 h4.4`} stroke="#555" strokeWidth={0.9} />
        </g>
      ))}
      <g fontSize="3.8" fill="#eaf1ff" textAnchor="middle" fontFamily={FONT}>
        <text x={90} y={-44}>NC</text>
        <text x={100} y={-44}>COM</text>
        <text x={110} y={-44}>NO</text>
        <text x={0} y={-12}>VCC</text>
        <text x={10} y={-12}>GND</text>
        <text x={20} y={-12}>IN</text>
      </g>
      <rect x={-6} y={-36} width={6} height={4} rx={0.8} fill={on ? '#ff4d4d' : '#6a2a2a'} />
      <Glow cx={-3} cy={-34} r={10} color="#ff4d4d" intensity={on ? 0.9 : 0} />
      <text x={-3} y={-24} textAnchor="middle" fontSize="3.6" fill="#eaf1ff" fontFamily={FONT}>
        {part.props.trigger === 'low' ? 'LOW' : 'HIGH'}
      </text>
    </g>
  );
});

export const relay: PartDef = {
  type: 'relay',
  name: 'Módulo de relé',
  category: 'Salidas',
  description: 'Relé de 5 V con transistor y LED. Conmuta COM entre NO y NC según la entrada IN.',
  keywords: ['rele', 'relay', 'conmutador', 'srd-05vdc', 'modulo'],
  defaults: { trigger: 'high' },
  pins: () => [
    { id: 'VCC', x: 0, y: 0, kind: 'leg', label: 'VCC' },
    { id: 'GND', x: 10, y: 0, kind: 'leg', label: 'GND' },
    { id: 'IN', x: 20, y: 0, kind: 'leg', label: 'IN' },
    { id: 'NC', x: 90, y: -60, kind: 'socket', label: 'NC' },
    { id: 'COM', x: 100, y: -60, kind: 'socket', label: 'COM' },
    { id: 'NO', x: 110, y: -60, kind: 'socket', label: 'NO' },
  ],
  bounds: () => ({ x: -15, y: -77, w: 138, h: 78 }),
  fields: [
    {
      key: 'trigger',
      label: 'Se activa con',
      kind: 'select',
      options: [
        { value: 'high', label: 'IN alto' },
        { value: 'low', label: 'IN bajo' },
      ],
    },
  ],
  model: 'Comportamental',
  sim(ctx) {
    const vcc = ctx.net('VCC');
    const gnd = ctx.net('GND');
    const inn = ctx.net('IN');
    let on = false;
    let dirty = false;
    const elements: Element[] = [
      new Resistor(vcc, gnd, () => (on ? 70 : 50_000)), // bobina y LED del módulo
      new Resistor(inn, gnd, () => 10_000),
      new Resistor(ctx.net('COM'), ctx.net('NO'), () => (on ? 0.05 : 1e9)),
      new Resistor(ctx.net('COM'), ctx.net('NC'), () => (on ? 1e9 : 0.05)),
    ];
    return {
      elements,
      changed: () => {
        const d = dirty;
        dirty = false;
        return d;
      },
      tracker: {
        sample(v) {
          const supply = volt(v, vcc) - volt(v, gnd);
          const vin = volt(v, inn) - volt(v, gnd);
          const active = ctx.props.trigger === 'low' ? (on ? vin < 2.2 : vin < 1.5) : on ? vin > 1.2 : vin > 2.0;
          const next = supply > 4 && active;
          if (next !== on) {
            on = next;
            dirty = true;
          }
        },
        read: () => ({ on }),
      },
    };
  },
  Render: RelayRender,
};

// ── Pantalla LCD 16×2 (HD44780) ─────────────────────────────────────────────
const LCD_PINS = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];

export const LcdRender = memo(function LcdRender({ part, visual }: RenderProps) {
  const serial = part.type === 'lcd-i2c';
  const blue = part.props.color === 'blue';
  const on = Boolean(visual?.on);
  const light = Number(visual?.backlight ?? 0);
  const lines = [String(visual?.line0 ?? ''), String(visual?.line1 ?? '')];
  const glass = blue ? (light > 0.002 ? '#2f63d6' : '#1b2f63') : light > 0.002 ? '#a7d34a' : '#5f7a2f';
  const ink = blue ? '#f2f6ff' : '#14260a';
  const cell = blue ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  return (
    <g>
      {!serial && LCD_PINS.map((id, i) => (
        <g key={id}>
          <Leg x={i * 10} y0={-8} y1={0} />
        </g>
      ))}
      <g filter="url(#f-shadow)">
        <rect x={-20} y={-150} width={320} height={142} rx={4} fill="#1f6f3f" stroke="#14532d" strokeWidth={0.8} />
      </g>
      {[
        [-12, -142],
        [292, -142],
        [-12, -16],
        [292, -16],
      ].map(([cx, cy]) => (
        <g key={`${cx}${cy}`}><circle cx={cx} cy={cy} r={4.3} fill="url(#g-metal)" /><circle cx={cx} cy={cy} r={2.5} fill="#123d26" /></g>
      ))}
      <rect x={-4} y={-128} width={288} height={92} rx={3} fill="#121315" />
      <rect x={-3} y={-127} width={286} height={90} rx={2.5} fill="none" stroke="#535a5e" strokeWidth="0.8" />
      {[[-.5,-124],[280,-124],[-.5,-40],[280,-40]].map(([x,y]) => <Screw key={`${x}:${y}`} x={x} y={y} r={1.2} />)}
      <rect x={6} y={-118} width={268} height={72} rx={2} fill={glass} />
      <rect x={7} y={-117} width={266} height={70} rx={1.5} fill="url(#g-sheen)" opacity="0.5" />
      {on &&
        lines.map((text, row) =>
          Array.from({ length: 16 }, (_, c) => {
            const x = 12 + c * 16;
            const y = -110 + row * 32;
            return (
              <g key={`${row}-${c}`}>
                <rect x={x} y={y} width={14} height={24} rx={0.6} fill={cell} />
                <text x={x + 7} y={y + 18} textAnchor="middle" fontSize="18" fontWeight={500} fill={ink} fontFamily={FONT}>
                  {text[c] ?? ''}
                </text>
              </g>
            );
          }),
        )}
      <g fontSize="3.4" fill="#e3f5e8" textAnchor="middle" fontFamily={FONT}>
        {!serial && LCD_PINS.map((id, i) => (
          <text key={id} x={i * 10} y={-12}>
            {id}
          </text>
        ))}
      </g>
      {serial && <g>
        <rect x={-35} y={-107} width={12} height={44} rx={1} fill="url(#g-header)" />
        {['GND', 'VCC', 'SDA', 'SCL'].map((pin, i) => <g key={pin}>
          <path d={`M-40 ${-100 + i * 10}h15`} stroke="url(#g-metal)" strokeWidth={2.4} />
          <text x={-21} y={-98.5 + i * 10} fontSize={3.5} fill="#e3f5e8" fontFamily={FONT}>{pin}</text>
        </g>)}
        <text x={14} y={-20} fontSize={5} fill="#e3f5e8" fontFamily={FONT}>I²C · PCF8574 · {String(part.props.address ?? '0x27')}</text>
      </g>}
    </g>
  );
});

export const lcd1602: PartDef = {
  type: 'lcd-1602',
  name: 'Pantalla LCD 16×2',
  category: 'Salidas',
  description: 'Controlador HD44780 en modo de 4 u 8 bits, compatible con la librería LiquidCrystal.',
  keywords: ['lcd', '16x2', '1602', 'pantalla', 'display', 'hd44780', 'liquidcrystal'],
  defaults: { color: 'green' },
  pins: () => LCD_PINS.map((id, i) => ({ id, x: i * 10, y: 0, kind: 'leg' as const, label: id })),
  bounds: () => ({ x: -21, y: -151, w: 322, h: 152 }),
  fields: [
    {
      key: 'color',
      label: 'Retroiluminación',
      kind: 'select',
      options: [
        { value: 'green', label: 'Verde' },
        { value: 'blue', label: 'Azul' },
      ],
    },
  ],
  model: 'Comportamental',
  sim(ctx) {
    const n = (id: string) => ctx.net(id);
    const vss = n('VSS');
    const vdd = n('VDD');
    const rs = n('RS');
    const e = n('E');
    const data = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map(n);
    // Retroiluminación: LED con la resistencia de 100 Ω que llevan los módulos en placa.
    const mid = ctx.node();
    const backlight = new Diode(n('A'), mid, 0.02 / Math.exp(3.0 / (2 * 0.025852)), 2);
    const lcd = new Hd44780();
    let eHigh = false;
    let latched = { rs: false, byte: 0 };
    let powered = false;
    const elements: Element[] = [new Resistor(vdd, vss, () => 3000), backlight, new Resistor(mid, n('K'), () => 100)];
    for (const pin of [rs, e, ...data]) elements.push(new Resistor(pin, vss, () => 1e8));
    return {
      elements,
      probe: (v) => ({ backlight: Math.max(0, backlight.currentOf(v)) }),
      tracker: {
        sample(v) {
          const ref = volt(v, vss);
          powered = volt(v, vdd) - ref > 4;
          if (!powered) return;
          const high = volt(v, e) - ref > 2.5;
          if (high) {
            let byte = 0;
            data.forEach((node, bit) => {
              if (volt(v, node) - ref > 2.5) byte |= 1 << bit;
            });
            latched = { rs: volt(v, rs) - ref > 2.5, byte };
          } else if (eHigh) {
            lcd.strobe(latched.rs, latched.byte);
          }
          eHigh = high;
        },
        read: () => ({ on: powered && lcd.displayOn, line0: lcd.line(0), line1: lcd.line(1), v: lcd.version }),
      },
    };
  },
  Render: LcdRender,
};

