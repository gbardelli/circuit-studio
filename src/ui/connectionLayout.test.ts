import { describe, expect, it } from 'vitest';
import { compactConnections } from './connectionLayout';
import { buildNetlist } from '../core/netlist';
import { PARTS } from '../parts';
import type { CircuitSnapshot, PartData } from '../core/types';
import { wirePoints, suggestWireColor } from './geometry';
import { wireCrossings } from './ConnectionGuide';

const part = (id: string, type: string, x: number, y: number): PartData => ({ id,type,x,y,rot:0,props:{...PARTS[type].defaults} });
const networks = (s: CircuitSnapshot) => {
  const groups = new Map<number,string[]>();
  for (const [pin,net] of buildNetlist(s,PARTS).netOf) groups.set(net,[...(groups.get(net) ?? []),pin]);
  return [...groups.values()].map(g=>g.sort()).sort((a,b)=>a[0].localeCompare(b[0]));
};

describe('connection layout',()=>{
  it('packs boards with their inserted components and preserves every electrical net',()=>{
    const before: CircuitSnapshot = {parts:[part('b1','breadboard-full',0,0),part('b2','breadboard-full',0,600),part('u1','74hc08',90,700)],wires:[{id:'w',a:{part:'b1',pin:'a7',x:90,y:60},b:{part:'b2',pin:'b7',x:90,y:670},points:[{x:200,y:55},{x:240,y:320}],color:'#3e7bfa'}]};
    const original=JSON.stringify(before),after=compactConnections(before);
    expect(after.parts.find(p=>p.id==='b2')?.y).toBe(250);
    expect(after.parts.find(p=>p.id==='u1')?.y).toBe(350);
    expect(networks(after)).toEqual(networks(before));
    expect(after.wires[0].a).toEqual(before.wires[0].a);expect(after.wires[0].b).toEqual(before.wires[0].b);
    const points=wirePoints(after.wires[0],new Map(after.parts.map(p=>[p.id,p])));
    expect(points.every((p,i)=>!i||p.x===points[i-1].x||p.y===points[i-1].y)).toBe(true);
    expect(JSON.stringify(before)).toBe(original);
    expect(compactConnections(after)).toEqual(after);
  });
  it('keeps independently arranged columns and rotated boards in place',()=>{
    const rotated={...part('r','breadboard-full',1000,800),rot:90 as const};
    const before={parts:[part('a','breadboard-full',0,0),part('b','breadboard-full',900,700),rotated],wires:[]};
    expect(compactConnections(before)).toEqual(before);
  });
  it('does not compress the paths between external devices',()=>{
    const before: CircuitSnapshot={parts:[part('b1','breadboard-full',0,0),part('b2','breadboard-full',0,600),part('mcu','arduino-giga',-520,0),part('screen','nextion-28',-470,330)],wires:[{id:'serial',a:{part:'mcu',pin:'5V',x:-400,y:200},b:{part:'screen',pin:'VCC',x:-490,y:420},points:[{x:-400,y:230},{x:-548,y:230},{x:-548,y:420}],color:'#f4f4f5'}]};
    expect(compactConnections(before).wires).toEqual(before.wires);
  });
  it('marks a crossing but never an endpoint as a bridge',()=>{
    const wire=(id:string,a:{x:number;y:number},b:{x:number;y:number})=>({id,a,b,points:[],color:'#3e7bfa'});
    const hits=wireCrossings({parts:[],wires:[wire('v',{x:50,y:0},{x:50,y:100}),wire('h',{x:0,y:50},{x:100,y:50}),wire('end',{x:50,y:100},{x:100,y:100})]});
    expect(hits.get('h')).toEqual([{x:50,y:50}]);expect(hits.get('end')).toEqual([]);
  });
  it('uses stable power, ground, clock and reset conventions',()=>{
    expect(suggestWireColor('VCC')).toBe('#e5484d');expect(suggestWireColor('GND.3')).toBe('#26272b');
    expect(suggestWireColor('CLK')).toBe('#f5c518');expect(suggestWireColor('RESET')).toBe('#9b6bf2');
    expect(suggestWireColor('D1')).toBe(suggestWireColor('D2'));
  });
});
