// MB102 / YwRobot regulated breadboard supply. External DC adapter is implicit, like a bench source.
import { memo, useId } from 'react';
import { VSource } from '../core/solver';
import type { PartDef, RenderProps } from './types';

const RAIL_OPTIONS = [
  { value: '5', label: '5 V' },
  { value: '3.3', label: '3,3 V' },
  { value: '0', label: 'Desconectado' },
];
const NEXT: Record<number, number> = { 5: 3.3, 3.3: 0, 0: 5 };
const volts = (v: unknown) => (Math.abs(Number(v) - 3.3) < 0.01 ? 3.3 : Number(v) === 0 ? 0 : 5);
const R_OUT = 0.3; // el regulador AMS1117 se hunde algo bajo carga
const nodeV = (v: Float64Array, n: number) => (n < 0 ? 0 : v[n]);

// Patillas macho en una columna: par + − del riel de arriba y par + − del de abajo, a la
// misma separación que los rieles de la protoboard (y = 0, 10 y 180, 190).
const PINS = [
  { id: 'TP', x: 0, y: 0, label: 'Salida + del riel de arriba', desc: 'Se clava en el riel + de arriba de la protoboard' },
  { id: 'TN', x: 0, y: 10, label: 'Masa del riel de arriba', desc: 'Se clava en el riel − de arriba' },
  { id: 'BP', x: 0, y: 180, label: 'Salida + del riel de abajo', desc: 'Se clava en el riel + de abajo' },
  { id: 'BN', x: 0, y: 190, label: 'Masa del riel de abajo', desc: 'Se clava en el riel − de abajo' },
];

const PowerRender = memo(function PowerRender({ part, visual, onInput, preview }: RenderProps) {
  const id = useId().replace(/:/g, '');
  const on = visual ? Boolean(visual.on) : part.props.on !== false;
  const live = !preview && Boolean(onInput);
  const lit = visual ? Boolean(visual.on) : on;
  const jumper = (key: 'top' | 'bottom', y: number) => {
    const value = volts(visual?.[`${key}Setting`] ?? part.props[key]);
    const x = value === 3.3 ? -52 : value === 5 ? -38 : -66; // posición del puente: 3,3 · 5 · fuera
    return (
      <g key={key} data-interactive={live ? 'true' : undefined} style={{ cursor: live ? 'pointer' : undefined }}
        onPointerDown={(e) => { if (!live) return; e.stopPropagation(); onInput?.(key, NEXT[value]); }}>
        <rect x={-70} y={y - 7} width={36} height={14} rx={2} fill="#e6c53a" stroke="#8c7414" strokeWidth={0.5} />
        {[-62, -52, -42].map((px) => <circle key={px} cx={px} cy={y} r={2} fill="#2a2415" />)}
        {value !== 0 && <rect x={x - 6} y={y - 5} width={22} height={10} rx={2} fill="#f08a1e" stroke="#a85a0b" strokeWidth={0.5} />}
        <text x={-62} y={y + 13} textAnchor="middle" fontSize={4} fill="#d6dbe0">3,3</text>
        <text x={-42} y={y + 13} textAnchor="middle" fontSize={4} fill="#d6dbe0">5 V</text>
      </g>
    );
  };
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-pcb`} x2="1" y2="0.6"><stop stopColor="#32362e"/><stop offset="0.3" stopColor="#171d1a"/><stop offset="1" stopColor="#0e1211"/></linearGradient>
        <linearGradient id={`${id}-metal`}><stop stopColor="#737c82"/><stop offset="0.2" stopColor="#dfe3dc"/><stop offset="0.45" stopColor="#a6b0b1"/><stop offset="0.7" stopColor="#e1e4dc"/><stop offset="1" stopColor="#747d81"/></linearGradient>
      </defs>
      {/* PCB, copper edge and regulator packages. */}
      <rect x={-122} y={-14} width={128} height={218} rx={4} fill={`url(#${id}-pcb)`} stroke="#68705b" strokeWidth={0.8} />
      <text x={-58} y={100} textAnchor="middle" fontSize={7} fontWeight={600} fill="#cfd5db" transform="rotate(-90 -58 100)">
        {'YwRobot · MB102'}
      </text>
      {/* USB tipo A */}
      <rect x={-122} y={18} width={46} height={30} rx={2} fill={`url(#${id}-metal)`} stroke="#6e7781" strokeWidth={0.6} />
      <rect x={-118} y={24} width={36} height={6} fill="#efefec" />
      <rect x={-118} y={34} width={36} height={6} fill="#2a2d31" />
      <rect x={-111} y={17} width={20} height={3} rx={1} fill="#e2e5de" opacity={0.65}/>
      {[34, 102].map(y => <g key={y}>
        <rect x={-56} y={y} width={14} height={10} rx={1} fill="#919b96"/>
        <rect x={-54} y={y+5} width={10} height={13} rx={1} fill="#171b1b" stroke="#505956" strokeWidth={0.5}/>
        {[0,4,8].map(dx=><rect key={dx} x={-53+dx} y={y+17} width={2} height={7} fill="#aeb5ad"/>)}
        <text x={-49} y={y+13} fontSize={3} textAnchor="middle" fill="#b8c2bb">1117</text>
      </g>)}
      {[60, 132].map(y => <g key={y}>
        <rect x={-75} y={y} width={18} height={20} rx={3} fill="#101717" stroke="#858f88" strokeWidth={0.7}/>
        <ellipse cx={-66} cy={y+3} rx={8} ry={4} fill={`url(#${id}-metal)`}/>
        <path d={`M-70 ${y+3}h8m-4 -3v6`} stroke="#6d7872" strokeWidth={0.7}/>
      </g>)}
      <text x={-99} y={58} fontSize={4} textAnchor="middle" fill="#ccd3cb">USB 5 V OUT</text>
      {/* jack de entrada */}
      <rect x={-122} y={150} width={40} height={30} rx={2} fill="#1b1d20" stroke="#52585f" strokeWidth={0.6} />
      <circle cx={-104} cy={165} r={6} fill="#08090a" />
      <circle cx={-104} cy={165} r={1.6} fill="#9aa1a8" />
      <text x={-102} y={190} textAnchor="middle" fontSize={4} fill="#9aa1a8">6,5–12 V</text>
      {/* interruptor */}
      <g data-interactive={live ? 'true' : undefined} style={{ cursor: live ? 'pointer' : undefined }}
        onPointerDown={(e) => { if (!live) return; e.stopPropagation(); onInput?.('on', !on); }}>
        <rect x={-96} y={96} width={22} height={18} rx={2} fill="#9aa0a6" stroke="#5c6269" strokeWidth={0.6} />
        <rect x={-91} y={on ? 99 : 106} width={12} height={7} rx={1} fill="#f2f2f0" />
      </g>
      {/* LED de encendido */}
      <circle cx={-96} cy={80} r={3} fill={lit ? '#46e06b' : '#1f3a27'} />
      {lit && <circle cx={-96} cy={80} r={8} fill="#46e06b" opacity={0.25} />}
      {/* puentes: uno por par de rieles */}
      {jumper('top', 8)}
      {jumper('bottom', 188)}
      {/* patillas */}
      {PINS.map((p) => <g key={p.id}>
        <rect x={-2} y={p.y - 1.4} width={8} height={2.8} fill="#c4a664" />
        <text x={-8} y={p.y + 1.6} textAnchor="end" fontSize={3.6} fill="#d6dbe0">{p.id.endsWith('P') ? '+' : '−'}</text>
      </g>)}
    </g>
  );
});

export const breadboardPower: PartDef = {
  type: 'mb102-power',
  name: 'Fuente para protoboard · MB102',
  category: 'Energía',
  sku: 'MB102',
  description: 'MB102 / YwRobot para insertar en los rieles. Entrada externa por jack DC de 6,5–12 V; USB-A de salida en la variante representada. Jumpers independientes de 5 V, 3,3 V o desconectado. Simulación regulada aproximada con caída bajo carga; no calcula temperatura ni garantiza los 700 mA anunciados.',
  keywords: ['mb102', 'fuente protoboard', 'fuente para protoboard', 'breadboard power supply', 'ywrobot', 'ams1117', '3.3v', '5v', 'alimentacion', 'usb', 'jack'],
  defaults: { on: true, top: 5, bottom: 5 },
  pins: () => PINS.map((p) => ({ ...p, kind: 'leg' as const })),
  internal: () => [['TN', 'BN']],
  reference: 'TN',
  pinRole: (id) => id.endsWith('N') ? 'ground' : 'power',
  bounds: () => ({ x: -123, y: -15, w: 130, h: 220 }),
  fields: [
    { key: 'on', label: 'Interruptor', kind: 'boolean' },
    { key: 'top', label: 'Riel de arriba', kind: 'select', options: RAIL_OPTIONS },
    { key: 'bottom', label: 'Riel de abajo', kind: 'select', options: RAIL_OPTIONS },
  ],
  model: 'Ideal',
  thumbScale: 0.4,
  sim(ctx) {
    const value = (key: string) => ctx.input(key) ?? ctx.props[key];
    const enabled = (key: 'top' | 'bottom') => value('on') !== false && volts(value(key)) > 0;
    const gnd = ctx.net('TN');
    const rail = (pin: 'TP' | 'BP', key: 'top' | 'bottom') =>
      new VSource(ctx.net(pin), gnd, () => enabled(key) ? volts(value(key)) : 0, () => enabled(key) ? R_OUT : 1e12);
    const top = rail('TP', 'top'), bottom = rail('BP', 'bottom');
    return {
      elements: [top, bottom],
      probe: (v) => ({
        topSetting: volts(value('top')), bottomSetting: volts(value('bottom')),
        on: value('on') !== false ? 1 : 0,
        top: nodeV(v, ctx.net('TP')) - nodeV(v, gnd),
        bottom: nodeV(v, ctx.net('BP')) - nodeV(v, gnd),
        i: top.currentOf(v) + bottom.currentOf(v),
      }),
    };
  },
  Render: PowerRender,
};
