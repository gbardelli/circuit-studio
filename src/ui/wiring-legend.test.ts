import { describe, expect, it } from 'vitest';
import { buildNetlist } from '../core/netlist';
import { PARTS } from '../parts';
import type { CircuitSnapshot } from '../core/types';
import { connectionLegend, renameLegendEntry, updateLegendLabel } from './wiring-legend';

const snapshot:CircuitSnapshot={parts:[{id:'chip',type:'74hc08',x:0,y:0,rot:0,props:{...PARTS['74hc08'].defaults,nets:'1A=AUDIO0;1B=AUDIO1'}}],wires:[{id:'one',a:{part:'chip',pin:'1A',x:0,y:0},b:{x:200,y:100},points:[],color:'#1878de'},{id:'two',a:{part:'chip',pin:'1B',x:0,y:0},b:{x:220,y:100},points:[],color:'#42ade8'}]};
describe('project wiring legend',()=>{
  it('muestra una entrada por cada color usado, sin inventar nombres', () => {
    const colors = ['#1878de', '#67ac28', '#e0a214'];
    const scene: CircuitSnapshot = { parts: [], wires: [...colors, '#1878de'].map((color, i) => ({ id: String(i), a: { x: i * 30, y: 0 }, b: { x: i * 30, y: 50 }, points: [], color })) };
    const legend = connectionLegend(scene, buildNetlist(scene, PARTS), []);
    expect(legend.map((e) => [e.color, e.label, e.count])).toEqual([['#1878de', '', 2], ['#67ac28', '', 1], ['#e0a214', '', 1]]);
  });
  it('usa el nombre que le dio el usuario a cada color y deja los nombrados primero', () => {
    const legend = connectionLegend(snapshot, buildNetlist(snapshot, PARTS), [{ color: '#42ade8', label: 'Entrada derecha' }, { color: '#ff0000', label: 'No utilizado' }]);
    expect(legend.map((row) => row.label)).toEqual(['Entrada derecha', '']);
    expect(legend[1].names).toEqual(['AUDIO0']);
  });
  it('edits a single color without erasing the rest of a saved group',()=>{
    const next=updateLegendLabel([{color:'#1878de',colors:['#1878de','#42ade8'],label:'Audio'}],'#1878de','Izquierda');
    expect(next).toEqual([{color:'#1878de',colors:['#1878de'],label:'Izquierda'},{color:'#42ade8',colors:['#42ade8'],label:'Audio'}]);
    expect(updateLegendLabel(next,'#1878de','')).toEqual([{color:'#42ade8',colors:['#42ade8'],label:'Audio'}]);
  });
  it('renombra una entrada entera de la leyenda y vuelve a la automática con un nombre vacío', () => {
    const named = renameLegendEntry([{ color: '#111111', colors: ['#111111'], label: 'Viejo' }], ['#AA0000', '#bb0000'], 'Llamadas');
    expect(named[0]).toEqual({ color: '#aa0000', colors: ['#aa0000', '#bb0000'], label: 'Llamadas' });
    expect(named[1].label).toBe('Viejo');
    expect(renameLegendEntry(named, ['#aa0000', '#bb0000'], '  ')).toEqual([{ color: '#111111', colors: ['#111111'], label: 'Viejo' }]);
  });
});
