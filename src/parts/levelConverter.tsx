import { memo } from 'react';
import { Diode, NMOS, Resistor } from '../core/solver';
import type { PartDef, RenderProps } from './types';

// SparkFun BOB-12009: BSS138 gates at LV, 10 kΩ pull-ups on both sides.
// Order follows the manufacturer's PCB: channel 1/2, supply, ground, channel 3/4.
const ROWS = ['1', '2', 'V', 'G', '3', '4'];
const ConverterRender = memo(function ConverterRender({part}: RenderProps) {
  return <g>
    <text x={25} y={-15} fontSize={9} fontWeight={550} textAnchor="middle" fill="#dce2e8" stroke="#101215" strokeWidth={3} paintOrder="stroke">{String(part.props.label??'Adaptador de nivel').replace(/^Interfaz · /,'')}</text>
    <rect x={-5} y={-6} width={60} height={62} rx={3} fill="#8d1728" stroke="#df6874" strokeWidth={.6}/>
    <path d="M-3 -4h55v58" fill="none" stroke="#ee9ba5" strokeOpacity={.25}/>
    {ROWS.map((row, i) => <g key={row}>
      {[0,50].map(x => <g key={x}><circle cx={x} cy={i*10} r={3} fill="#c4a664"/><circle cx={x} cy={i*10} r={1.4} fill="#161719"/></g>)}
      <text x={7} y={i*10+1.4} fontSize={3.4} fill="#f3dfe1">{row==='V'?'LV':row==='G'?'GND':`L${row}`}</text>
      <text x={43} y={i*10+1.4} fontSize={3.4} textAnchor="end" fill="#f3dfe1">{row==='V'?'HV':row==='G'?'GND':`H${row}`}</text>
    </g>)}
    {[4,14,34,44].map(y=><g key={y}><rect x={23} y={y-2} width={6} height={4} rx={.4} fill="#17191c"/><path d={`M21 ${y-1}h2m6 0h2M21 ${y+1}h2`} stroke="#a8afb5" strokeWidth={1}/></g>)}
    <text x={25} y={27} textAnchor="middle" fontSize={3} fill="#f2c4cb">3V3 ↔ 5V</text>
  </g>;
});
export const levelConverter: PartDef = {
  type: 'level-converter-4', name: 'Adaptador de nivel · 4 canales', category: 'Semiconductores',
  sku: 'BOB-12009',
  description: 'SparkFun BOB-12009. Cuatro canales bidireccionales con BSS138 y resistencias de 10 kΩ. LV a 3,3 V, HV a 5 V y tierra común. No es un integrado de control.',
  keywords: ['sparkfun', 'bob-12009', 'bss138', 'level shifter', '3.3v', '5v', 'adaptador'], defaults: {},
  pins: () => ROWS.flatMap((row,i) => [0,50].map(x => ({ id: row==='V'?(x?'HV':'LV'):row==='G'?(x?'GND.H':'GND.L'):`${x?'H':'L'}${row}`, x, y:i*10, kind:'socket' as const,
    label: row==='V'?(x?'Alimentación alta, 5 V':'Alimentación baja, 3,3 V'):row==='G'?'Tierra común':`Canal ${row}, lado ${x?'5 V':'3,3 V'}` }))),
  internal: () => [['GND.H','GND.L']], bounds: () => ({x:-6,y:-7,w:62,h:64}), reference:'GND.L', model:'SPICE', thumbScale:1.1,
  sim(ctx) {
    const elements = [];
    for(let i=1;i<=4;i++) {
      const low=ctx.net(`L${i}`), high=ctx.net(`H${i}`);
      elements.push(new Resistor(ctx.net('LV'),low,()=>10_000), new Resistor(ctx.net('HV'),high,()=>10_000),
        new NMOS(high,ctx.net('LV'),low,1.0,.1), new Diode(low,high,1e-12,1.1));
    }
    return {elements};
  },
  Render: ConverterRender,
};

// Módulo TXS0108E (HW-221): 8 canales bidireccionales. Fila de arriba VB, B1–B8, GND; fila de
// abajo VA, A1–A8, OE. VA 1,2–3,6 V (lado bajo), VB 1,65–5,5 V (lado alto) y VA ≤ VB. OE alto
// habilita; OE bajo deja todo en alta impedancia y desconecta las pull-ups internas.
// Modelo: transistor de paso con la puerta en OE y pull-ups internas a cada lado (≈40 kΩ con la
// salida en bajo; el acelerador de flancos no se modela).
const TXS_TOP = ['VB', ...Array.from({ length: 8 }, (_, i) => `B${i + 1}`), 'GND'];
const TXS_BOTTOM = ['VA', ...Array.from({ length: 8 }, (_, i) => `A${i + 1}`), 'OE'];
const TXS_ROW = 50;
const TxsRender = memo(function TxsRender({ part }: RenderProps) {
  return <g>
    <text x={45} y={-14} fontSize={9} fontWeight={550} textAnchor="middle" fill="#dce2e8" stroke="#101215" strokeWidth={3} paintOrder="stroke">{String(part.props.label ?? 'TXS0108E')}</text>
    <rect x={-6} y={-6} width={102} height={TXS_ROW + 12} rx={3} fill="#1d4fa8" stroke="#6f9be6" strokeWidth={.6}/>
    {[TXS_TOP, TXS_BOTTOM].map((row, r) => row.map((id, i) => <g key={id}>
      <circle cx={i * 10} cy={r * TXS_ROW} r={3} fill="#c4a664"/><circle cx={i * 10} cy={r * TXS_ROW} r={1.4} fill="#161719"/>
      <text x={i * 10} y={r ? TXS_ROW - 6 : 9} fontSize={3.2} textAnchor="middle" fill="#e8eef9">{id}</text>
    </g>))}
    <rect x={33} y={18} width={24} height={14} rx={1} fill="#16181b"/>
    <text x={45} y={27} fontSize={3.4} textAnchor="middle" fill="#9aa1a8">TXS0108E</text>
    <text x={45} y={39} fontSize={3} textAnchor="middle" fill="#cfe0ff">A 3V3 ↔ B 5V</text>
  </g>;
});
const TXS_DESC: Record<string, string> = {
  VB: 'Alimentación del lado B (alto): 1,65–5,5 V. Aquí 5 V', GND: 'Tierra común de los dos lados',
  VA: 'Alimentación del lado A (bajo): 1,2–3,6 V y nunca mayor que VB. Aquí el 3V3 del GIGA',
  OE: 'Habilitación: alto (únelo a VA) activa los canales; bajo los deja en alta impedancia',
};
export const levelConverter8: PartDef = {
  type: 'level-converter-8', name: 'Adaptador de nivel · 8 canales', category: 'Semiconductores',
  sku: 'TXS0108E',
  description: 'Módulo TXS0108E (HW-221). Ocho canales bidireccionales: A1–A8 al lado bajo (VA, 3,3 V) y B1–B8 al lado alto (VB, 5 V). OE debe ir a VA para habilitarlo. Tierra común.',
  keywords: ['txs0108e', 'txs0108', 'hw-221', 'level shifter', '8 canales', '3.3v', '5v', 'adaptador'], defaults: {},
  pins: () => [
    ...TXS_TOP.map((id, i) => ({ id, x: i * 10, y: 0, kind: 'socket' as const, label: TXS_DESC[id] ?? `Canal ${id.slice(1)}, lado B (5 V)` })),
    ...TXS_BOTTOM.map((id, i) => ({ id, x: i * 10, y: TXS_ROW, kind: 'socket' as const, label: TXS_DESC[id] ?? `Canal ${id.slice(1)}, lado A (3,3 V)` })),
  ],
  bounds: () => ({ x: -7, y: -7, w: 104, h: TXS_ROW + 14 }), reference: 'GND', model: 'SPICE', thumbScale: 0.9,
  sim(ctx) {
    const elements = [];
    const oe = ctx.net('OE'), va = ctx.net('VA'), vb = ctx.net('VB');
    for (let i = 1; i <= 8; i++) {
      const a = ctx.net(`A${i}`), b = ctx.net(`B${i}`);
      elements.push(new Resistor(va, a, () => 40_000), new Resistor(vb, b, () => 40_000),
        new NMOS(b, oe, a, 1.0, .1), new Diode(a, b, 1e-12, 1.1));
    }
    return { elements };
  },
  Render: TxsRender,
};
