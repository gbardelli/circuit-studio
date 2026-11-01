import { describe, expect, it } from 'vitest';
import { buildNetlist } from '../core/netlist';
import { PARTS } from '../parts';
import type { CircuitSnapshot } from '../core/types';
import { connectionLegend, updateLegendLabel } from './wiring-legend';

const snapshot:CircuitSnapshot={parts:[{id:'chip',type:'74hc08',x:0,y:0,rot:0,props:{...PARTS['74hc08'].defaults,nets:'1A=AUDIO0;1B=AUDIO1'}}],wires:[{id:'one',a:{part:'chip',pin:'1A',x:0,y:0},b:{x:200,y:100},points:[],color:'#1878de'},{id:'two',a:{part:'chip',pin:'1B',x:0,y:0},b:{x:220,y:100},points:[],color:'#42ade8'}]};
describe('project wiring legend',()=>{
  it('does not infer application-specific roles from a multicolor anonymous circuit',()=>{
    const colors=['#1878de','#67ac28','#e0a214','#8566da','#d65b99','#39a9c2'];
    const anonymous:CircuitSnapshot={parts:[],wires:colors.map((color,i)=>({id:String(i),a:{x:i*30,y:0},b:{x:i*30,y:50},points:[],color}))};
    expect(connectionLegend(anonymous,buildNetlist(anonymous,PARTS),[])).toMatchObject([{label:'Sin etiqueta',colors}]);
  });
  it('derives the actual bus name and never interprets blue as an elevator cabin',()=>{
    const legend=connectionLegend(snapshot,buildNetlist(snapshot,PARTS),null);
    expect(legend).toMatchObject([{label:'AUDIO',colors:['#1878de','#42ade8']}]);
    expect(legend.some(row=>row.label==='Cabina')).toBe(false);
  });
  it('keeps explicit project labels ahead of derived names and only includes used colors',()=>{
    const legend=connectionLegend(snapshot,buildNetlist(snapshot,PARTS),[{color:'#1878de',label:'Entrada izquierda'},{color:'#ff0000',label:'No utilizado'}]);
    expect(legend.map(row=>row.label)).toEqual(['Entrada izquierda','AUDIO']);
  });
  it('edits a single color without erasing the rest of a saved group',()=>{
    const next=updateLegendLabel([{color:'#1878de',colors:['#1878de','#42ade8'],label:'Audio'}],'#1878de','Izquierda');
    expect(next).toEqual([{color:'#1878de',colors:['#1878de'],label:'Izquierda'},{color:'#42ade8',colors:['#42ade8'],label:'Audio'}]);
    expect(updateLegendLabel(next,'#1878de','')).toEqual([{color:'#42ade8',colors:['#42ade8'],label:'Audio'}]);
  });
  it('identifies power from the connected pin, independent of wire color',()=>{
    const power:CircuitSnapshot={...snapshot,wires:[{...snapshot.wires[0],a:{part:'chip',pin:'GND',x:0,y:0},color:'#ff0000'}]};
    expect(connectionLegend(power,buildNetlist(power,PARTS),[])[0].label).toBe('GND');
  });
});
