// Osciloscopio de dos canales. Muestrea la tensión de cada sonda respecto a GND en cada paso
// del motor (que ya corta en cada flanco de un pin del Arduino) y pide pasos más finos según
// la base de tiempos. Disparo por flanco de subida en CH1 para que una señal periódica quede
// quieta; sin disparo, la traza corre. Mide frecuencia y tensión pico a pico.
import { memo } from 'react';
import { Resistor } from '../core/solver';
import type { PartDef, RenderProps, Visual } from './types';
import { formatSI } from '../core/units';

const COLS = 240; // columnas de la traza
const DIV_X = 10;
const DIV_Y = 8;
const W = 200; // pantalla en unidades de mundo
const H = 160;

export const TIMEBASES = [10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 100e-3, 200e-3, 500e-3, 1];
const VOLTS = [0.1, 0.2, 0.5, 1, 2, 5, 10];

const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const volt = (v: Float64Array, n: number) => (n < 0 ? 0 : v[n]);

/** Muestras (t, ch1, ch2) con tensión constante desde t hasta la siguiente. */
export class Capture {
  t: number[] = [];
  a: number[] = [];
  b: number[] = [];
  push(t: number, a: number, b: number, keep: number) {
    this.t.push(t);
    this.a.push(a);
    this.b.push(b);
    // Se conservan dos pantallas: una para buscar el disparo y otra para mostrar.
    let drop = 0;
    while (drop < this.t.length - 2 && this.t[drop + 1] < t - keep) drop++;
    if (drop > 0) {
      this.t.splice(0, drop);
      this.a.splice(0, drop);
      this.b.splice(0, drop);
    }
  }
  /** Valor vigente en el instante t (búsqueda binaria). */
  at(list: number[], t: number) {
    let lo = 0;
    let hi = this.t.length - 1;
    if (hi < 0 || t < this.t[0]) return NaN;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return list[lo];
  }
}

/** Parte de la pantalla anterior al disparo (una división), como en un osciloscopio real. */
export const PRETRIGGER = 1 / DIV_X;

/** Instante del último flanco de subida de CH1 que deja una pantalla completa a su alrededor. */
export function triggerStart(cap: Capture, span: number, now: number, level: number): number | null {
  for (let i = cap.t.length - 1; i > 0; i--) {
    const t = cap.t[i];
    if (t + span * (1 - PRETRIGGER) > now || t - span * PRETRIGGER < cap.t[0]) continue;
    if (cap.a[i - 1] < level && cap.a[i] >= level) return t;
    if (t < now - 2 * span) break;
  }
  return null;
}

/** Frecuencia a partir de los flancos de subida que hay en la captura. */
export function measureFrequency(cap: Capture, level: number) {
  const edges: number[] = [];
  for (let i = 1; i < cap.t.length; i++) if (cap.a[i - 1] < level && cap.a[i] >= level) edges.push(cap.t[i]);
  if (edges.length < 2) return 0;
  const n = Math.min(edges.length - 1, 20);
  return n / (edges[edges.length - 1] - edges[edges.length - 1 - n]);
}

const encode = (values: number[]) => values.map((v) => (Number.isNaN(v) ? '' : v.toFixed(3))).join(' ');
const decode = (s: unknown) => (typeof s === 'string' && s ? s.split(' ').map((x) => (x === '' ? NaN : Number(x))) : []);

// ── Aparato ─────────────────────────────────────────────────────────────────────
function Trace({ values, perDiv, color }: { values: number[]; perDiv: number; color: string }) {
  if (!values.length) return null;
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (Number.isNaN(v)) {
      pen = false;
      return;
    }
    const x = (i / (values.length - 1)) * W;
    const y = H / 2 - (v / perDiv) * (H / DIV_Y);
    const yc = Math.max(-2, Math.min(H + 2, y));
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${yc.toFixed(1)}`;
    pen = true;
  });
  return (
    <>
      <path d={d} fill="none" stroke={color} strokeWidth={3} strokeOpacity={0.18} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.1} strokeLinejoin="round" />
    </>
  );
}

const ScopeRender = memo(function ScopeRender({ part, visual }: RenderProps) {
  const tb = num(part.props.timebase, 1e-3);
  const v1 = num(part.props.volts1, 2);
  const v2 = num(part.props.volts2, 2);
  const a = decode(visual?.a);
  const b = decode(visual?.b);
  const freq = num(visual?.freq, 0);
  const vpp = num(visual?.vpp, 0);
  const armed = Boolean(visual?.trig);
  const x0 = 14;
  const y0 = -196;
  return (
    <g>
      {/* carcasa */}
      <rect x={-12} y={-216} width={330} height={224} rx={9} fill="#2b2e34" />
      <rect x={-12} y={-216} width={330} height={224} rx={9} fill="url(#g-chip)" />
      <rect x={-6} y={-210} width={318} height={212} rx={6} fill="#cfd3d9" />
      <rect x={-6} y={-210} width={318} height={3} rx={1.5} fill="#fff" opacity={0.5} />
      {/* pantalla */}
      <rect x={x0 - 8} y={y0 - 8} width={W + 16} height={H + 16} rx={4} fill="#14161a" />
      <g transform={`translate(${x0} ${y0})`}>
        <rect width={W} height={H} fill="#06120d" />
        <g stroke="#2d5a44" strokeWidth={0.4}>
          {Array.from({ length: DIV_X + 1 }, (_, i) => (
            <line key={`x${i}`} x1={(i * W) / DIV_X} y1={0} x2={(i * W) / DIV_X} y2={H} strokeOpacity={i === DIV_X / 2 ? 0.9 : 0.45} />
          ))}
          {Array.from({ length: DIV_Y + 1 }, (_, i) => (
            <line key={`y${i}`} x1={0} y1={(i * H) / DIV_Y} x2={W} y2={(i * H) / DIV_Y} strokeOpacity={i === DIV_Y / 2 ? 0.9 : 0.45} />
          ))}
        </g>
        {armed && <path d={`M${W * PRETRIGGER} 0 l-3 -4 h6 z`} fill="#ffd84a" />}
        <Trace values={b} perDiv={v2} color="#43d9ff" />
        <Trace values={a} perDiv={v1} color="#ffd84a" />
        <g fontFamily="Geist, sans-serif" fontSize={7} style={{ fontVariantNumeric: 'tabular-nums' }}>
          <text x={4} y={10} fill="#ffd84a">
            CH1 {formatSI(v1, 'V')}/div
          </text>
          <text x={70} y={10} fill="#43d9ff">
            CH2 {formatSI(v2, 'V')}/div
          </text>
          <text x={W - 4} y={10} fill="#b8f5d2" textAnchor="end">
            {formatSI(tb, 's')}/div
          </text>
          <text x={4} y={H - 5} fill="#ffd84a" opacity={0.9}>
            {freq > 0 ? formatSI(freq, 'Hz') : '— Hz'} · {formatSI(vpp, 'V')} pp
          </text>
          <text x={W - 4} y={H - 5} fill={armed ? '#7dffb0' : '#6a8f7c'} textAnchor="end">
            {part.props.trigger === 'none' ? 'Libre' : armed ? 'Disparo ↑' : 'Auto'}
          </text>
        </g>
      </g>
      {/* mandos */}
      {[
        { y: -176, label: 'Tiempo' },
        { y: -128, label: 'CH1' },
        { y: -80, label: 'CH2' },
      ].map((k) => (
        <g key={k.label}>
          <circle cx={268} cy={k.y} r={15} fill="#1b1c1f" />
          <circle cx={268} cy={k.y} r={13} fill="url(#g-knob)" />
          <line x1={268} y1={k.y} x2={268} y2={k.y - 10} stroke="#e8eaed" strokeWidth={1.6} strokeLinecap="round" transform={`rotate(${k.label === 'Tiempo' ? -120 + 15 * TIMEBASES.indexOf(tb) : -90 + 30 * VOLTS.indexOf(k.label === 'CH1' ? v1 : v2)} 268 ${k.y})`} />
          <text x={268} y={k.y + 23} textAnchor="middle" fontSize={6} fill={k.label === 'CH1' ? '#9a7a00' : k.label === 'CH2' ? '#0a7a99' : '#4c535b'} fontFamily="Geist, sans-serif" fontWeight={600}>
            {k.label}
          </text>
        </g>
      ))}
      {/* entradas */}
      {[
        { x: 60, label: 'CH1', ring: '#e8c21c' },
        { x: 130, label: 'CH2', ring: '#25b8e0' },
        { x: 200, label: 'GND', ring: '#1d1e21' },
      ].map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={0} r={9} fill="#9aa1a9" />
          <circle cx={p.x} cy={0} r={7} fill={p.ring} />
          <circle cx={p.x} cy={0} r={3.2} fill="#c9ced4" />
          <circle cx={p.x} cy={0} r={1.5} fill="#3b4148" />
          <text x={p.x} y={-13} textAnchor="middle" fontSize={7} fontWeight={600} fill="#3b4148" fontFamily="Geist, sans-serif">
            {p.label}
          </text>
        </g>
      ))}
    </g>
  );
});

export const oscilloscope: PartDef = {
  type: 'oscilloscope',
  name: 'Osciloscopio',
  category: 'Instrumentos',
  description: 'Dos canales con disparo por flanco. Conecta CH1 y CH2 a lo que quieras ver y GND a la tierra del circuito. Muestra la frecuencia y la tensión pico a pico de CH1.',
  keywords: ['osciloscopio', 'oscilloscope', 'scope', 'onda', 'señal', 'forma de onda', 'pwm', 'frecuencia', 'medir', 'instrumento', 'traza'],
  defaults: { timebase: 1e-3, volts1: 2, volts2: 2, trigger: 'auto' },
  pins: () => [
    { id: 'CH1', x: 60, y: 0, kind: 'socket', label: 'Canal 1', desc: 'Sonda amarilla: tensión respecto a GND' },
    { id: 'CH2', x: 130, y: 0, kind: 'socket', label: 'Canal 2', desc: 'Sonda azul: tensión respecto a GND' },
    { id: 'GND', x: 200, y: 0, kind: 'socket', label: 'GND', desc: 'Pinza de masa: a la tierra del circuito' },
  ],
  bounds: () => ({ x: -13, y: -217, w: 332, h: 227 }),
  fields: [
    { key: 'timebase', label: 'Tiempo por división', kind: 'select', options: TIMEBASES.map((t) => ({ value: String(t), label: `${formatSI(t, 's')}/div` })) },
    { key: 'volts1', label: 'CH1, voltios por división', kind: 'select', options: VOLTS.map((v) => ({ value: String(v), label: `${formatSI(v, 'V')}/div` })) },
    { key: 'volts2', label: 'CH2, voltios por división', kind: 'select', options: VOLTS.map((v) => ({ value: String(v), label: `${formatSI(v, 'V')}/div` })) },
    {
      key: 'trigger',
      label: 'Disparo',
      kind: 'select',
      options: [
        { value: 'auto', label: 'Flanco de subida en CH1' },
        { value: 'none', label: 'Libre (la traza corre)' },
      ],
    },
  ],
  model: 'Ideal',
  thumbScale: 0.32,
  sim(ctx) {
    const ch1 = ctx.net('CH1');
    const ch2 = ctx.net('CH2');
    const gnd = ctx.net('GND');
    const cap = new Capture();
    let t = 0;
    const span = () => num(ctx.props.timebase, 1e-3) * DIV_X;
    // Al menos ~2 muestras por columna de pantalla, sin bajar de 2 µs.
    const step = () => Math.max(2e-6, span() / (COLS * 2));
    return {
      elements: [new Resistor(ch1, gnd, () => 1e6), new Resistor(ch2, gnd, () => 1e6)],
      nextEvent: () => t + step(),
      tracker: {
        sample(v, dt) {
          const ref = volt(v, gnd);
          cap.push(t, volt(v, ch1) - ref, volt(v, ch2) - ref, 2.2 * span());
          t += dt;
        },
        read(): Visual {
          const s = span();
          let lo = Infinity;
          let hi = -Infinity;
          for (const x of cap.a) {
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
          }
          const level = Number.isFinite(lo) ? (lo + hi) / 2 : 0;
          const swing = hi - lo > 0.05;
          const start = ctx.props.trigger !== 'none' && swing ? triggerStart(cap, s, t, level) : null;
          const from = start !== null ? start - s * PRETRIGGER : t - s;
          const a: number[] = [];
          const b: number[] = [];
          for (let i = 0; i < COLS; i++) {
            const at = from + (i / (COLS - 1)) * s;
            a.push(cap.at(cap.a, at));
            b.push(cap.at(cap.b, at));
          }
          return { a: encode(a), b: encode(b), freq: swing ? measureFrequency(cap, level) : 0, vpp: Number.isFinite(lo) ? hi - lo : 0, trig: start !== null };
        },
      },
    };
  },
  Render: ScopeRender,
};
