import { describe, expect, it } from 'vitest';
import type { CircuitSnapshot, PartData } from '../core/types';
import { PARTS } from '../parts';
import { assemblyFrame, buildAssemblyPlan, holeLabel, orientationText } from './assembly-plan';
import { clampPanelHeight } from './Workbench';

const part=(id:string,type:string,x:number,y:number):PartData=>({id,type,x,y,rot:0,props:{...PARTS[type].defaults}});
const fixture=():CircuitSnapshot=>({parts:[part('b','breadboard-full',0,0),part('u','74hc08',90,100),part('r','resistor',150,60)],wires:[{id:'w',a:{part:'b',pin:'tp1',x:30,y:20},b:{part:'u',pin:'VCC',x:0,y:0},points:[],color:'#e6535b'},{id:'s',a:{part:'u',pin:'1Y',x:0,y:0},b:{part:'r',pin:'1',x:150,y:60},points:[],color:'#1878de'}]});
describe('progressive assembly plan',()=>{
  it('starts completely empty and reveals one placed item per step',()=>{
    const source=fixture(),plan=buildAssemblyPlan(source),before=structuredClone(source);
    expect(assemblyFrame(source,plan,null).snapshot).toEqual({parts:[],wires:[]});
    expect(plan.steps[0]).toMatchObject({kind:'part',part:{id:'b'}});
    for(let i=0;i<plan.steps.length;i++){
      const frame=assemblyFrame(source,plan,plan.steps[i].key);
      expect(frame.snapshot.parts.length+frame.snapshot.wires.length).toBe(i);
      expect(frame.current?.key).toBe(plan.steps[i].key);
    }
    const end=assemblyFrame(source,plan,'end');expect(end.snapshot).toEqual(source);expect(end.current).toBeUndefined();expect(source).toEqual(before);
  });
  it('places socket owners before mounted devices and all devices before cables',()=>{
    const source=fixture();source.parts.reverse();const plan=buildAssemblyPlan(source);
    expect(plan.steps.findIndex(s=>s.key==='part:b')).toBeLessThan(plan.steps.findIndex(s=>s.key==='part:u'));
    expect(plan.steps.slice(0,3).every(s=>s.kind==='part')).toBe(true);
    expect(plan.steps[3]).toMatchObject({kind:'wire',phase:'power'});
    const chip=plan.steps.find(s=>s.key==='part:u');expect(chip?.kind==='part'&&chip.placements.some(p=>p.board==='b')).toBe(true);
  });
  it('leaves schematic-only links out of physical assembly',()=>{
    const source=fixture();source.wires[0].sch=true;expect(buildAssemblyPlan(source).wires).toBe(1);
  });
  it('preserves the current step by identity when another item is added',()=>{
    const source=fixture(),before=buildAssemblyPlan(source);const key=before.steps.find(s=>s.key==='part:u')!.key;
    const changed={...source,parts:[part('b2','breadboard-full',900,0),...source.parts]};
    expect(assemblyFrame(changed,buildAssemblyPlan(changed),key).current?.key).toBe(key);
  });
  it('changes a placement signature when orientation or value changes',()=>{
    const source=fixture(),original=buildAssemblyPlan(source).steps.find(s=>s.key==='part:r')!.signature;
    const changed=structuredClone(source);changed.parts.find(p=>p.id==='r')!.props.resistance=4700;
    expect(buildAssemblyPlan(changed).steps.find(s=>s.key==='part:r')!.signature).not.toBe(original);
  });
  it('describes physical rows, rails and notch orientation',()=>{
    expect(holeLabel('b23')).toBe('fila B, columna 23');expect(holeLabel('tp1')).toBe('riel + superior, columna 1');
    expect(orientationText({...part('u','74hc08',0,0),rot:180})).toContain('la derecha');
  });
  it('bounds panel resizing while retaining usable canvas space',()=>{
    expect(clampPanelHeight(500,700)).toBe(500);expect(clampPanelHeight(900,700)).toBe(560);expect(clampPanelHeight(50,700)).toBe(200);expect(clampPanelHeight(300,250)).toBe(180);
  });
});
