import { describe, expect, it } from 'vitest';
import { readableConnections, deviceNetworks, namedPins, signalColors } from './readableConnections';
import { OrthogonalRouter } from './connectionLayout';
import { PARTS } from '../parts';
import { pinKey } from '../core/netlist';
import type { CircuitSnapshot, PartData } from '../core/types';

const part=(id:string,type:string,x:number,y:number):PartData=>({id,type,x,y,rot:0,props:{...PARTS[type].defaults}});
describe('readable physical connections',()=>{
  it('separates four stages into two columns while preserving all device connections',()=>{
    const before:CircuitSnapshot={parts:[...Array.from({length:4},(_,i)=>part(`b${i}`,'breadboard-full',0,i*250)),part('chip','74hc08',90,600)],wires:[{id:'bus',a:{part:'b0',pin:'a7',x:90,y:60},b:{part:'b2',pin:'b7',x:90,y:570},color:'#3e7bfa',points:[]}]};
    const after=readableConnections(before);
    expect(after.parts.slice(0,4).map(p=>[p.x,p.y])).toEqual([[0,0],[900,0],[0,430],[900,430]]);
    expect(after.parts.find(p=>p.id==='chip')).toMatchObject({x:90,y:530});
    expect(deviceNetworks(after)).toEqual(deviceNetworks(before));
    expect(readableConnections(after)).toEqual(after);
  });
  it('keeps a shared signal the same color and separates destination bits from reset and clock',()=>{
    const chip={...part('u','74hc08',0,0),props:{...PARTS['74hc08'].defaults,nets:'1A=DEST0;1B=DEST1;2A=CLK;2B=RESET'}};
    const s:CircuitSnapshot={parts:[chip],wires:[]},result=signalColors(s);
    const color=(pin:string)=>result.colors.get(result.nets.netOf.get(pinKey('u',pin))!)!.color;
    expect(new Set(['1A','1B','2A','2B'].map(color)).size).toBe(4);
  });
  it('routes around component bodies with orthogonal, separated tracks',()=>{
    const router=new OrthogonalRouter([part('r','resistor',100,100)],true);
    const a=router.route({x:0,y:100},{x:200,y:100}),b=router.route({x:0,y:100},{x:200,y:100});
    expect(a.some(p=>p.y!==100)).toBe(true);
    expect(a).not.toEqual(b);
    for(const route of[a,b]) for(let i=1;i<route.length;i++) {
      expect(route[i].x===route[i-1].x || route[i].y===route[i-1].y).toBe(true);
      const p=route[i-1],q=route[i];
      for(let t=0;t<=1;t+=.05){const x=p.x+(q.x-p.x)*t,y=p.y+(q.y-p.y)*t;expect(x>107 && x<133 && y>91 && y<109).toBe(false);}
    }
  });
  it('preserves complete signal names containing an equals sign',()=>{
    expect(namedPins({...part('c','74hc85',0,0),props:{nets:'OAEQB=DEST=PISO;OAGTB=DEST>PISO'}})).toEqual([['OAEQB','DEST=PISO'],['OAGTB','DEST>PISO']]);
  });
});
