import { Resistor } from '../core/solver';
import { DFPlayer } from '../sim/dfplayer';
import type { PartDef } from './types';

const names = ['VCC', 'RX', 'TX', 'DAC_R', 'DAC_L', 'SPK1', 'GND', 'SPK2', 'IO1', 'GND2', 'IO2', 'ADKEY1', 'ADKEY2', 'USB+', 'USB-', 'BUSY'];

export const dfplayer: PartDef = {
  type: 'dfplayer-mini', name: 'DFPlayer Mini', partNumber: 'HW-247A', category: 'Salidas',
  description: 'Reproductor MP3 por puerto serie. Carga archivos de audio para escucharlos en el navegador.',
  keywords: ['dfplayer', 'mp3', 'audio', 'serial', 'hw-247a'], defaults: {},
  pins: () => names.map((id, i) => ({ id, x: i < 8 ? 0 : 70, y: (i < 8 ? i : 15 - i) * 10, kind: 'leg' as const, label: id })),
  bounds: () => ({ x: -6, y: -8, w: 82, h: 86 }), ground: ['GND', 'GND2'], internal: () => [['GND', 'GND2']],
  model: 'Comportamental',
  Render: () => <g><rect x="-4" y="-6" width="78" height="82" rx="4" fill="#12528b" stroke="#75a4c0" strokeWidth="1" />
    {names.map((id, i) => <g key={id}><circle cx={i < 8 ? 0 : 70} cy={(i < 8 ? i : 15 - i) * 10} r="3.2" fill="#d7bb70" /><circle cx={i < 8 ? 0 : 70} cy={(i < 8 ? i : 15 - i) * 10} r="1.6" fill="#262b2b" /></g>)}
    <rect x="15" y="3" width="40" height="26" rx="2" fill="#c9c9c3" stroke="#777" /><rect x="19" y="6" width="32" height="19" fill="#303335" />
    <rect x="18" y="36" width="34" height="25" rx="2" fill="#171a1c" stroke="#444" /><text x="35" y="47" textAnchor="middle" fontSize="4.7" fill="#ddd">DFPLAYER</text><text x="35" y="54" textAnchor="middle" fontSize="4" fill="#aebac2">MINI</text>
    <text x="35" y="70" textAnchor="middle" fontSize="4" fill="#e6eef1">HW-247A</text></g>,
  sim(ctx) {
    const player = new DFPlayer();
    const vcc = ctx.net('VCC'), gnd = ctx.net('GND');
    const powered = (v: Float64Array) => { const d = (vcc < 0 ? 0 : v[vcc]) - (gnd < 0 ? 0 : v[gnd]); return d >= 3.2 && d <= 5.5; };
    return { elements: [new Resistor(vcc, gnd, () => 500), new Resistor(ctx.net('RX'), gnd, () => 1e8), new Resistor(ctx.net('TX'), gnd, () => 1e8)],
      uart: { pins: { rx: 'RX', tx: 'TX', ground: 'GND', supply: 'VCC' }, powered, baud: () => 9600, receive: (b) => player.receive(b), drain: () => player.drain() },
      afterSolve: (v) => player.power(powered(v)),
      onInput: (key, value) => { if (key === 'finished' && typeof value === 'number') player.finish(value); },
      tracker: { sample: () => {}, read: () => ({ powered: player.powered, playing: player.playing, track: player.track, volume: player.volume, sequence: player.sequence }) } };
  },
};

export const speaker50: PartDef = {
  type: 'speaker-50mm', name: 'Parlante 50 mm · 8 Ω', partNumber: 'SP-50MM', category: 'Salidas',
  description: 'Parlante de 8 Ω y 2 W para la salida SPK1/SPK2 del DFPlayer.', keywords: ['parlante', 'altavoz', 'speaker', 'audio', '8 ohm', 'sp-50mm'], defaults: {},
  pins: () => [{ id: 'A', x: -20, y: 0, kind: 'leg', label: '+' }, { id: 'B', x: 20, y: 0, kind: 'leg', label: '−' }],
  bounds: () => ({ x: -52, y: -52, w: 104, h: 104 }), model: 'Comportamental',
  Render: () => <g><circle r="50" fill="#34383b" stroke="#a7abad" strokeWidth="2" /><circle r="44" fill="#17191b" stroke="#51555a" strokeWidth="3" /><circle r="35" fill="#292d30" stroke="#666b6d" /><circle r="18" fill="#141719" stroke="#41474a" /><circle cx="-20" cy="0" r="2" fill="#c7ad65" /><circle cx="20" cy="0" r="2" fill="#c7ad65" /></g>,
};
