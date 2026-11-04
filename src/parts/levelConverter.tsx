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
