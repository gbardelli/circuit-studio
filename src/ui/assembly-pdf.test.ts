import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAssemblyPdf } from './assembly-pdf';
import { materials } from './lab-utils';
import type { CircuitSnapshot } from '../core/types';

const fonts: [Uint8Array,Uint8Array] = [new Uint8Array(readFileSync('public/fonts/NotoSans-Regular.ttf')),new Uint8Array(readFileSync('public/fonts/NotoSans-Bold.ttf'))];
const snapshot: CircuitSnapshot = { parts:Array.from({length:65},(_,i)=>({id:`r${i}`,type:'resistor',x:i*50,y:0,rot:0,props:{resistance:100+i}})),wires:[{id:'schematic',a:{x:0,y:0},b:{x:20,y:0},color:'#e5484d',points:[],sch:true}] };
describe('printable assembly documents',()=>{
  it('paginates a long bill of materials and embeds the Unicode font',async()=>{
    const doc=await buildAssemblyPdf({name:'Proyecto de medición · Ω µ',snapshot,currency:'PEN',prices:{[materials(snapshot)[0].key]:2.5},purchased:{},scope:'materials',date:new Date('2026-10-31T12:00:00Z')},fonts);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.getFontList().NotoSans).toEqual(['normal','bold']);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(10000);
    expect(materials(snapshot).some(row=>row.key==='wire')).toBe(false);
  });
  it('includes guide pages without treating schematic lines as physical cables',async()=>{
    const doc=await buildAssemblyPdf({name:'Guía de prueba',snapshot:{...snapshot,parts:snapshot.parts.slice(0,2)},currency:'USD',prices:{},purchased:{},scope:'guide'},fonts);
    expect(doc.getNumberOfPages()).toBe(3);
  });
});
