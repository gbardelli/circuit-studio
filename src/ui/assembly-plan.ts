import { buildNetlist } from '../core/netlist';
import type { CircuitSnapshot, PartData, WireData, WireEnd } from '../core/types';
import { PARTS } from '../parts';

export type AssemblyPhase = 'base' | 'parts' | 'power' | 'signals';
export const ASSEMBLY_PHASES: {id:AssemblyPhase;label:string}[] = [
  {id:'base',label:'Placas y base'}, {id:'parts',label:'Componentes'},
  {id:'power',label:'Alimentación'}, {id:'signals',label:'Señales'},
];
export interface AssemblyPlacement { pin:string; board:string; hole:string }
export type AssemblyStep = {
  key:string; signature:string; phase:AssemblyPhase; title:string;
} & ({kind:'part';part:PartData;owner?:string;placements:AssemblyPlacement[]} | {kind:'wire';wire:WireData});
export interface AssemblyPlan { steps:AssemblyStep[]; parts:number; wires:number }
const cache = new WeakMap<CircuitSnapshot,AssemblyPlan>();

export const isPowerPin=(pin='')=>/^(?:3V3|5V|VIN|VCC|VDD|VSS|GND(?:\.\d+)?|[tb][pn]\d+|\+|-)$/i.test(pin);
export const wireAssemblySignature=(wire:WireData)=>JSON.stringify([wire.a,wire.b,wire.color]);
export const partTitle=(p:PartData)=>String(p.props.label || p.props.partNumber || PARTS[p.type]?.partNumber || PARTS[p.type]?.name || p.type);
export function holeLabel(pin:string) {
  const hole=pin.match(/^([a-j])(\d+)$/i),rail=pin.match(/^([tb])([pn])(\d+)$/i);
  if(hole) return `fila ${hole[1].toUpperCase()}, columna ${hole[2]}`;
  if(rail) return `riel ${rail[2]==='p'?'+':'−'} ${rail[1]==='t'?'superior':'inferior'}, columna ${rail[3]}`;
  return pin;
}
export function assemblyEndLabel(end:WireEnd,snapshot:CircuitSnapshot) {
  const part=snapshot.parts.find(p=>p.id===end.part);
  return part ? `${partTitle(part)} · ${part.type.startsWith('breadboard')?holeLabel(end.pin??'?'):end.pin??'?'}` : 'Extremo libre';
}
export function orientationText(part:PartData) {
  if(/^(74hc|74ls|cd4|ne555|attiny)/.test(part.type)) return `Muesca hacia ${({0:'la izquierda',90:'arriba',180:'la derecha',270:'abajo'} as const)[part.rot]}.`;
  if(part.type==='led') return 'Respeta el ánodo A y el cátodo K; la pata larga es el ánodo.';
  if(part.type==='capacitor') return 'Respeta los terminales + y − indicados en la pieza.';
  if(part.type.startsWith('breadboard')) return 'Coloca los rieles y las letras de las filas en la orientación indicada.';
  return 'Coloca los conectores y las etiquetas con la orientación del dibujo.';
}

/** Pure presentation plan. Deriving or navigating it never changes the source circuit. */
export function buildAssemblyPlan(snapshot:CircuitSnapshot):AssemblyPlan {
  const hit=cache.get(snapshot);if(hit)return hit;
  const nets=buildNetlist(snapshot,PARTS),byId=new Map(snapshot.parts.map(p=>[p.id,p]));
  const placements=new Map<string,AssemblyPlacement[]>(),parents=new Map<string,Set<string>>();
  for(const [leg,socket]of nets.inserted) {
    const split=leg.lastIndexOf(':'),id=leg.slice(0,split),pin=leg.slice(split+1),s=socket.lastIndexOf(':'),board=socket.slice(0,s),hole=socket.slice(s+1);
    if(!byId.has(board)||board===id)continue;
    placements.set(id,[...(placements.get(id)??[]),{pin,board,hole}]);
    if(!parents.has(id))parents.set(id,new Set());parents.get(id)!.add(board);
  }
  const rank=(p:PartData)=>p.type.startsWith('breadboard')?0:PARTS[p.type]?.mcu||PARTS[p.type]?.category==='Energía'?1:/^(74hc|74ls|cd4|ne555)/.test(p.type)?2:3;
  const stage=(p:PartData)=>{
    const board=[...(parents.get(p.id)??[])].map(id=>byId.get(id)!).find(b=>b.type.startsWith('breadboard'));
    return board?snapshot.parts.indexOf(board):snapshot.parts.indexOf(p);
  };
  const remaining=[...snapshot.parts].sort((a,b)=>(rank(a)<2?rank(a):2)-(rank(b)<2?rank(b):2)||stage(a)-stage(b)||rank(a)-rank(b)||a.y-b.y||a.x-b.x||a.id.localeCompare(b.id));
  const ordered:PartData[]=[],placed=new Set<string>();
  while(remaining.length) {
    const index=remaining.findIndex(p=>[...(parents.get(p.id)??[])].every(id=>placed.has(id)));
    const [p]=remaining.splice(index<0?0:index,1);ordered.push(p);placed.add(p.id);
  }
  const partSteps:AssemblyStep[]=ordered.map(part=>{
    const pins=placements.get(part.id)??[],owner=pins.find(p=>byId.get(p.board)?.type.startsWith('breadboard'))?.board??pins[0]?.board;
    const physical=Object.fromEntries(Object.entries(part.props).filter(([key])=>['resistance','capacitance','color','cols','flip','partNumber'].includes(key)));
    return {kind:'part',key:`part:${part.id}`,part,owner,placements:pins,title:partTitle(part),phase:rank(part)<2?'base':'parts',signature:JSON.stringify([part.id,part.type,part.x,part.y,part.rot,physical,pins])};
  });
  const wireSteps:AssemblyStep[]=snapshot.wires.filter(w=>!w.sch).map(wire=>({kind:'wire',key:`wire:${wire.id}`,wire,title:`${assemblyEndLabel(wire.a,snapshot)} → ${assemblyEndLabel(wire.b,snapshot)}`,phase:isPowerPin(wire.a.pin)||isPowerPin(wire.b.pin)?'power':'signals',signature:wireAssemblySignature(wire)}));
  wireSteps.sort((a,b)=>Number(a.phase!=='power')-Number(b.phase!=='power'));
  const plan={steps:[...partSteps,...wireSteps],parts:partSteps.length,wires:wireSteps.length};cache.set(snapshot,plan);return plan;
}

export function assemblyFrame(snapshot:CircuitSnapshot,plan:AssemblyPlan,cursor:string|null) {
  const index=cursor===null?-1:cursor==='end'?plan.steps.length:Math.max(0,plan.steps.findIndex(s=>s.key===cursor));
  const visible=plan.steps.slice(0,Math.max(0,index)),parts=new Set(visible.filter(s=>s.kind==='part').map(s=>s.part.id)),wires=new Set(visible.filter(s=>s.kind==='wire').map(s=>s.wire.id));
  return {index,current:index>=0?plan.steps[index]:undefined,snapshot:{parts:snapshot.parts.filter(p=>parts.has(p.id)),wires:snapshot.wires.filter(w=>wires.has(w.id))}};
}
