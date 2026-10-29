// Fuente de laboratorio, generador de reloj, interruptor DIP y barra de LEDs: lo que hace falta
// para montar y probar circuitos digitales sin Arduino.
import { memo, useRef } from 'react';
import { Resistor, VSource, type Element } from '../core/solver';
import type { PartDef, RenderProps } from './types';
import { Glow, Screw, ledIntensity } from './common';
import { LED_COLORS, ledDiode } from './outputs';

const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const volt = (v: Float64Array, n: number) => (n < 0 ? 0 : v[n]);

// ── Fuente de alimentación de laboratorio ───────────────────────────────────────
// Tensión constante hasta el límite de corriente; al superarlo pasa a corriente constante (CC),
// como una fuente de banco real. La pantalla muestra lo que de verdad entrega.
const R_CC = 1e6;

const SupplyRender = memo(function SupplyRender({ part, visual, onInput, preview }: RenderProps) {
  const vset = num(part.props.voltage, 5);
  const iset = num(part.props.current, 1);
  const live = visual != null;
  const v = live ? Number(visual.v ?? 0) : vset;
  const i = live ? Math.abs(Number(visual.i ?? 0)) : 0;
  const cc = live && Boolean(visual.cc);
  const drag = useRef<{ key: string; y: number; start: number } | null>(null);
  const interactive = !preview && Boolean(onInput);
  const knob = (value: number, max: number) => -135 + (270 * Math.min(1, Math.max(0, value / max)));
  return (
    <g>
      {/* carcasa */}
      <rect x={-30} y={-118} width={180} height={124} rx={7} fill="url(#g-chip)" stroke="#111417" strokeWidth="0.8" />
      <rect x={-29} y={-117} width={178} height={122} rx={6} fill="none" stroke="#8a929b" strokeOpacity="0.35" strokeWidth="0.6" />
      <rect x={-24} y={-112} width={168} height={112} rx={4} fill="url(#g-anodized)" stroke="#6e7881" strokeWidth="0.7" />
      <rect x={-24} y={-112} width={168} height={112} rx={4} fill="url(#p-brushed)" />
      <rect x={-24} y={-112} width={168} height={3} rx={1.5} fill="#fff" opacity={0.5} />
      <path d="M-22 -3h164M-27 -106v100M147 -106v100" stroke="#0d1217" strokeWidth="0.6" strokeOpacity="0.35" />
      {[[-20,-108],[140,-108],[-20,-5],[140,-5]].map(([x,y]) => <Screw key={`${x}:${y}`} x={x} y={y} r={1.4} />)}
      {/* pantalla */}
      <rect x={-17} y={-105} width={154} height={42} rx={3} fill="#576167" />
      <rect x={-16} y={-104} width={152} height={40} rx={3} fill="#080d0b" />
      <path d="M-14 -102h148M-14 -102v36" stroke="#000" strokeWidth="1.4" />
      <rect x={-15} y={-103} width={150} height={16} rx={2} fill="url(#g-sheen)" opacity="0.35" />
      <rect x={-16} y={-104} width={152} height={40} rx={3} fill="none" stroke="#000" strokeOpacity={0.5} />
      <g fontFamily="Geist, sans-serif" fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
        <text x={56} y={-76} textAnchor="end" fontSize={20} fill={cc ? '#5b6a5f' : '#4dff88'}>
          {v.toFixed(2)}
        </text>
        <text x={60} y={-76} fontSize={9} fill="#4dff88" opacity={0.7}>
          V
        </text>
        <text x={124} y={-76} textAnchor="end" fontSize={20} fill={cc ? '#ff5a4a' : '#ff9a3d'}>
          {i.toFixed(3)}
        </text>
        <text x={127} y={-76} fontSize={9} fill="#ff9a3d" opacity={0.7}>
          A
        </text>
      </g>
      <g fontFamily="Geist, sans-serif" fontSize={5.4} fill="#7d8790">
        <text x={-10} y={-68}>
          límite {iset.toFixed(2)} A
        </text>
        <circle cx={104} cy={-70} r={2} fill={live && !cc ? '#4dff88' : '#21362a'} />
        <text x={108} y={-68}>
          CV
        </text>
        <circle cx={120} cy={-70} r={2} fill={cc ? '#ff5a4a' : '#3a2220'} />
        <text x={124} y={-68}>
          CC
        </text>
      </g>
      {/* mandos */}
      {[
        { x: 18, label: 'Tensión', key: 'voltage', value: vset, max: 30, step: 0.1, angle: knob(vset, 30) },
        { x: 92, label: 'Corriente', key: 'current', value: iset, max: 5, step: 0.01, angle: knob(iset, 5) },
      ].map((k) => (
        <g key={k.label} data-interactive={interactive ? 'true' : undefined} role={interactive ? 'slider' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? k.label : undefined} aria-valuemin={interactive ? 0 : undefined} aria-valuemax={interactive ? k.max : undefined} aria-valuenow={interactive ? k.value : undefined}
          style={{ cursor: interactive ? 'ns-resize' : undefined }}
          onPointerDown={(e) => { if (!interactive) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { key: k.key, y: e.clientY, start: k.value }; }}
          onPointerMove={(e) => { const d = drag.current; if (!d || d.key !== k.key || !onInput) return; onInput(k.key, Math.max(0, Math.min(k.max, Math.round((d.start + (d.y - e.clientY) * k.max / 240) / k.step) * k.step))); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onWheel={(e) => { if (!interactive || !onInput) return; e.stopPropagation(); onInput(k.key, Math.max(0, Math.min(k.max, +(k.value - Math.sign(e.deltaY) * k.step).toFixed(2)))); }}
          onKeyDown={(e) => { if (!interactive || !onInput || !['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); onInput(k.key, Math.max(0, Math.min(k.max, +(k.value + (e.key === 'ArrowUp' || e.key === 'ArrowRight' ? k.step : -k.step)).toFixed(2)))); }}>
          <circle cx={k.x} cy={-37} r={14.5} fill="#77818a" stroke="#ecf0f2" strokeWidth="0.5" />
          <circle cx={k.x} cy={-38} r={13} fill="url(#g-knob)" stroke="#12171b" strokeWidth="0.8" />
          {Array.from({length:24}, (_,i) => <line key={i} x1={k.x} y1={-50.5} x2={k.x} y2={-48.8} stroke="#101418" strokeWidth="0.65" transform={`rotate(${i*15} ${k.x} -38)`} />)}
          <circle cx={k.x} cy={-38} r={10.5} fill="url(#g-black-plastic)" stroke="#757c82" strokeWidth="0.3" />
          <line x1={k.x} y1={-38} x2={k.x} y2={-48} stroke="#e8eaed" strokeWidth={1.6} strokeLinecap="round" transform={`rotate(${k.angle} ${k.x} -38)`} />
          <text x={k.x} y={-17} textAnchor="middle" fontSize={5.6} fill="#4c535b" fontFamily="Geist, sans-serif">
            {k.label}
          </text>
        </g>
      ))}
      {/* bornes */}
      {[
        { x: 120, color: '#d8342b', sign: '+' },
        { x: 40, color: '#1d1e21', sign: '−' },
      ].map((b) => (
        <g key={b.sign}>
          <circle cx={b.x} cy={0} r={8} fill={b.color} />
          <circle cx={b.x} cy={0} r={8} fill="url(#g-sheen)" />
          <circle cx={b.x} cy={0} r={6.5} fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="0.7" />
          <circle cx={b.x} cy={0} r={2.6} fill="#c9ced4" />
          <circle cx={b.x} cy={0} r={1.4} fill="#4a4f55" />
          <text x={b.x} y={-11} textAnchor="middle" fontSize={8} fontWeight={600} fill="#3b4148" fontFamily="Geist, sans-serif">
            {b.sign}
          </text>
        </g>
      ))}
    </g>
  );
});

export const benchSupply: PartDef = {
  type: 'bench-supply',
  name: 'Fuente de alimentación',
  category: 'Energía',
  description: 'Fuente de laboratorio de 0–30 V y 0–5 A. Entrega tensión constante hasta el límite de corriente y entonces la limita (modo CC).',
  keywords: ['fuente', 'fuente de alimentacion', 'power supply', 'fuente de laboratorio', 'banco', 'regulable', 'variable', 'tension', 'corriente', 'dc'],
  defaults: { voltage: 5, current: 1 },
  pins: () => [
    { id: '-', x: 40, y: 0, kind: 'socket', label: 'Borne negativo (−)', desc: 'Conéctalo a la tierra del circuito' },
    { id: '+', x: 120, y: 0, kind: 'socket', label: 'Borne positivo (+)', desc: 'Salida regulada' },
  ],
  reference: '-',
  bounds: () => ({ x: -31, y: -119, w: 182, h: 128 }),
  fields: [
    { key: 'voltage', label: 'Tensión', kind: 'range', unit: 'V', min: 0, max: 30, step: 0.1 },
    { key: 'current', label: 'Límite de corriente', kind: 'range', unit: 'A', min: 0, max: 5, step: 0.01, hint: 'Al superarlo la fuente baja la tensión (modo CC)' },
  ],
  model: 'Ideal',
  thumbScale: 0.45,
  sim(ctx) {
    const p = ctx.net('+');
    const n = ctx.net('-');
    let cc = false;
    let dirty = false;
    const vset = () => num(ctx.props.voltage, 5);
    const ilim = () => Math.max(0, num(ctx.props.current, 1));
    const src = new VSource(p, n, () => (cc ? ilim() * R_CC : vset()), () => (cc ? R_CC : 0.02));
    return {
      elements: [src],
      probe: (v) => ({ v: volt(v, p) - volt(v, n), i: src.currentOf(v) }),
      changed: () => {
        const d = dirty;
        dirty = false;
        return d;
      },
      tracker: {
        sample(v) {
          const out = volt(v, p) - volt(v, n);
          const i = src.currentOf(v);
          if (!cc && i > ilim() * 1.002) {
            cc = true;
            dirty = true;
          } else if (cc && out > vset() + 1e-3) {
            cc = false;
            dirty = true;
          }
        },
        read: () => ({ cc }),
      },
    };
  },
  Render: SupplyRender,
};

// ── Generador de reloj ──────────────────────────────────────────────────────────
const ClockRender = memo(function ClockRender({ part, visual }: RenderProps) {
  const hz = num(part.props.frequency, 1);
  const on = Boolean(visual?.on);
  const label = hz >= 1000 ? `${+(hz / 1000).toFixed(2)} kHz` : `${+hz.toFixed(2)} Hz`;
  return (
    <g>
      <line x1={0} y1={-6} x2={0} y2={0} stroke="#a8afb6" strokeWidth={1.6} />
      <line x1={10} y1={-6} x2={10} y2={0} stroke="#a8afb6" strokeWidth={1.6} />
      <rect x={-12} y={-34} width={34} height={28} rx={3} fill="#2d5bd8" />
      <rect x={-12} y={-34} width={34} height={28} rx={3} fill="url(#g-sheen)" />
      <path d="M-6 -16 h5 v-9 h6 v9 h6 v-9 h5" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.3} fill="none" strokeLinejoin="round" />
      <circle cx={17} cy={-29} r={1.9} fill={on ? '#ffd23d' : '#5a4a1a'} />
      {on && <Glow cx={17} cy={-29} r={7} color="#ffd23d" intensity={0.8} />}
      <text x={5} y={-9} textAnchor="middle" fontSize={4.4} fill="#dfe6ff" fontFamily="Geist, sans-serif">
        {label}
      </text>
    </g>
  );
});

export const clockGen: PartDef = {
  type: 'clock',
  name: 'Generador de reloj',
  category: 'Entradas',
  description: 'Onda cuadrada de 0 a 5 V a la frecuencia que elijas. Para hacer avanzar contadores, biestables y registros.',
  keywords: ['reloj', 'clock', 'generador', 'onda cuadrada', 'pulsos', 'oscilador', 'frecuencia', 'señal'],
  defaults: { frequency: 1, duty: 50 },
  pins: () => [
    { id: 'OUT', x: 0, y: 0, kind: 'leg', label: 'Salida de reloj', desc: 'Onda cuadrada 0–5 V' },
    { id: 'GND', x: 10, y: 0, kind: 'leg', label: 'GND', desc: 'Tierra común con el circuito' },
  ],
  bounds: () => ({ x: -13, y: -35, w: 36, h: 36 }),
  fields: [
    { key: 'frequency', label: 'Frecuencia', kind: 'si', unit: 'Hz' },
    { key: 'duty', label: 'Ciclo de trabajo', kind: 'range', unit: '%', min: 5, max: 95, step: 1 },
  ],
  model: 'Ideal',
  thumbScale: 1.3,
  sim(ctx) {
    let high = true;
    let t = 0;
    let next = 0;
    let dirty = false;
    const period = () => 1 / Math.min(1e5, Math.max(0.01, num(ctx.props.frequency, 1)));
    const duty = () => Math.min(0.95, Math.max(0.05, num(ctx.props.duty, 50) / 100));
    next = period() * duty();
    const src = new VSource(ctx.net('OUT'), ctx.net('GND'), () => (high ? 5 : 0), () => 25);
    return {
      elements: [src],
      nextEvent: () => next,
      changed: () => {
        const d = dirty;
        dirty = false;
        return d;
      },
      tracker: {
        sample(_v, dt) {
          t += dt;
          while (t >= next - 1e-12) {
            high = !high;
            next += period() * (high ? duty() : 1 - duty());
            dirty = true;
          }
        },
        read: () => ({ on: high }),
      },
    };
  },
  Render: ClockRender,
};

// ── Interruptor DIP de 8 posiciones ─────────────────────────────────────────────
const DIP_N = 8;
const DipRender = memo(function DipRender({ part, onInput, preview }: RenderProps) {
  const live = !preview && onInput;
  return (
    <g>
      {Array.from({ length: DIP_N }, (_, i) => (
        <g key={i}>
          <rect x={i * 10 - 1.4} y={-1} width={2.8} height={5} fill="#b9c0c7" />
          <rect x={i * 10 - 1.4} y={26} width={2.8} height={5} fill="#b9c0c7" />
        </g>
      ))}
      <rect x={-5} y={3} width={DIP_N * 10} height={24} rx={1.5} fill="#c8302c" />
      <rect x={-5} y={3} width={DIP_N * 10} height={24} rx={1.5} fill="url(#g-chip)" />
      <text x={-2} y={8.6} fontSize={3.6} fill="#fff" fontWeight={600} fontFamily="Geist, sans-serif">
        ON
      </text>
      {Array.from({ length: DIP_N }, (_, i) => {
        const on = Boolean(part.props[`s${i + 1}`]);
        return (
          <g
            key={i}
            data-interactive={live ? 'true' : undefined}
            style={{ cursor: live ? 'pointer' : undefined }}
            onPointerDown={(e) => {
              if (!live) return;
              e.stopPropagation();
              onInput?.(`s${i + 1}`, !on);
            }}
          >
            <rect x={i * 10 - 3} y={10} width={6} height={12} rx={0.8} fill="#2a1312" />
            <rect x={i * 10 - 2.4} y={on ? 10.8 : 15.6} width={4.8} height={5.6} rx={0.6} fill="#f2f2f0" />
            <text x={i * 10} y={25.8} textAnchor="middle" fontSize={3.2} fill="#fff" opacity={0.85} fontFamily="Geist, sans-serif">
              {i + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
});

export const dipSwitch: PartDef = {
  type: 'dip-switch-8',
  name: 'Interruptor DIP ×8',
  category: 'Entradas',
  description: 'Ocho interruptores en encapsulado DIP. Cada uno une su patilla de abajo con la de arriba. Ideal para poner números binarios en las entradas de un chip.',
  keywords: ['dip switch', 'interruptor dip', 'microinterruptor', 'switches', 'binario', 'entradas', 'configuracion'],
  defaults: Object.fromEntries(Array.from({ length: DIP_N }, (_, i) => [`s${i + 1}`, false])),
  pins: () =>
    Array.from({ length: DIP_N }, (_, i) => [
      { id: `${i + 1}A`, x: i * 10, y: 30, kind: 'leg' as const, label: `Interruptor ${i + 1} · patilla ${i + 1}`, desc: `Con el interruptor ${i + 1} en ON, unida a la patilla de enfrente` },
      { id: `${i + 1}B`, x: i * 10, y: 0, kind: 'leg' as const, label: `Interruptor ${i + 1} · patilla ${2 * DIP_N - i}`, desc: `Con el interruptor ${i + 1} en ON, unida a la patilla de enfrente` },
    ]).flat(),
  bounds: () => ({ x: -6, y: -2, w: DIP_N * 10 + 2, h: 34 }),
  fields: Array.from({ length: DIP_N }, (_, i) => ({ key: `s${i + 1}`, label: `Interruptor ${i + 1}`, kind: 'boolean' as const })),
  model: 'Ideal',
  thumbScale: 1.1,
  sim(ctx) {
    const elements: Element[] = Array.from({ length: DIP_N }, (_, i) => new Resistor(ctx.net(`${i + 1}A`), ctx.net(`${i + 1}B`), () => (ctx.props[`s${i + 1}`] ? 0.05 : 1e9)));
    return { elements };
  },
  Render: DipRender,
};

// ── Barra de 10 LEDs ────────────────────────────────────────────────────────────
const BAR_N = 10;
const BarRender = memo(function BarRender({ part, visual }: RenderProps) {
  const color = LED_COLORS[String(part.props.color)] ?? LED_COLORS.red;
  return (
    <g>
      {Array.from({ length: BAR_N }, (_, i) => (
        <g key={i}>
          <rect x={i * 10 - 1.4} y={-1} width={2.8} height={5} fill="#b9c0c7" />
          <rect x={i * 10 - 1.4} y={26} width={2.8} height={5} fill="#b9c0c7" />
        </g>
      ))}
      <rect x={-5} y={3} width={BAR_N * 10} height={24} rx={1.2} fill="#18191c" />
      {Array.from({ length: BAR_N }, (_, i) => {
        const k = ledIntensity(Number(visual?.[`i${i}`] ?? 0), 0.01);
        return (
          <g key={i}>
            <rect x={i * 10 - 3} y={6} width={6} height={18} rx={0.6} fill={color.body} opacity={0.35} />
            <rect x={i * 10 - 3} y={6} width={6} height={18} rx={0.6} fill={color.light} opacity={k} />
            {k > 0.05 && <Glow cx={i * 10} cy={15} r={14} color={color.light} intensity={k * 0.7} />}
          </g>
        );
      })}
    </g>
  );
});

export const ledBar: PartDef = {
  type: 'led-bar-10',
  name: 'Barra de 10 LEDs',
  category: 'Salidas',
  description: 'Diez LEDs en un encapsulado DIP: ánodos abajo (patillas 1–10), cátodos arriba. Cada segmento necesita su resistencia.',
  keywords: ['barra de leds', 'bargraph', 'led bar', 'vumetro', 'nivel', 'leds', 'indicador'],
  defaults: { color: 'red' },
  pins: () =>
    Array.from({ length: BAR_N }, (_, i) => [
      { id: `A${i + 1}`, x: i * 10, y: 30, kind: 'leg' as const, label: `Ánodo ${i + 1} · patilla ${i + 1}`, desc: `Positivo del segmento ${i + 1}` },
      { id: `K${i + 1}`, x: i * 10, y: 0, kind: 'leg' as const, label: `Cátodo ${i + 1} · patilla ${2 * BAR_N - i}`, desc: `Negativo del segmento ${i + 1}` },
    ]).flat(),
  bounds: () => ({ x: -6, y: -2, w: BAR_N * 10 + 2, h: 34 }),
  fields: [{ key: 'color', label: 'Color', kind: 'select', options: Object.entries(LED_COLORS).map(([value, c]) => ({ value, label: c.label })) }],
  model: 'SPICE',
  thumbScale: 1,
  sim(ctx) {
    const vf = () => (LED_COLORS[String(ctx.props.color)] ?? LED_COLORS.red).vf;
    const diodes = Array.from({ length: BAR_N }, (_, i) => ledDiode(ctx.net(`A${i + 1}`), ctx.net(`K${i + 1}`), vf()));
    return {
      elements: diodes,
      probe: (v) => Object.fromEntries(diodes.map((d, i) => [`i${i}`, Math.max(0, d.currentOf(v))])),
    };
  },
  Render: BarRender,
};
