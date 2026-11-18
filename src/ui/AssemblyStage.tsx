import { HintButton } from './Overlays';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hand, Maximize, Minus, Plus, X } from 'lucide-react';
import type { PartData, Vec, WireData } from '../core/types';
import { PARTS } from '../parts';
import { endPosition, partBounds, wirePoints } from './geometry';
import { WireShape } from './wires';
import { useAssemblyGuide } from './useAssemblyGuide';
import { assemblyEndLabel, partTitle } from './assembly-plan';

export const AssemblyArtwork=memo(function AssemblyArtwork({part,ghost=false}:{part:PartData;ghost?:boolean}){
  const def=PARTS[part.type];
  const rendered=useMemo(()=>({...part,id:`assembly-stage-${part.id}`}),[part]);
  return <g data-assembly-part={part.id} data-pending={ghost?'true':undefined} className={`assembly-art ${ghost?'pending':''}`} transform={`translate(${part.x} ${part.y}) rotate(${part.rot})`}><title>{partTitle(part)}</title><def.Render part={rendered} visual={null} preview/></g>;
});

/** Un arrastre sólo se convierte en paneo al superar este umbral; si no, es un clic para identificar. */
const DRAG_THRESHOLD=4;
type Pick={kind:'part'|'wire';id:string};
type Gesture={id:number;button:number;x:number;y:number;vx:number;vy:number;moved:boolean;pick:Pick|null};

function pickAt(target:EventTarget|null):Pick|null{
  if(!(target instanceof Element))return null;
  const part=target.closest('[data-assembly-part]');
  if(part)return {kind:'part',id:part.getAttribute('data-assembly-part')!};
  const wire=target.closest('[data-assembly-wire]');
  if(wire)return {kind:'wire',id:wire.getAttribute('data-assembly-wire')!};
  return null;
}

export function AssemblyStage() {
  const {snapshot,frame,cursor,navigate,plan}=useAssemblyGuide();
  const container=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
  const [size,setSize]=useState({w:800,h:400}),[viewport,setViewport]=useState({x:0,y:0,zoom:1});
  const gesture=useRef<Gesture|null>(null);
  const [panning,setPanning]=useState(false),[selected,setSelected]=useState<Pick|null>(null);
  const parts=useMemo(()=>new Map(snapshot.parts.map(p=>[p.id,p])),[snapshot]);
  const focus=useMemo(()=>{
    const current=frame.current;
    if(current?.kind==='wire')return [endPosition(current.wire.a,parts),endPosition(current.wire.b,parts)];
    let placed=frame.snapshot.parts;
    if(current?.kind==='part'){
      const owner=current.owner?parts.get(current.owner):null;
      if(owner)placed=[owner,current.part];
      else if(current.part.type.startsWith('breadboard'))placed=[...placed.filter(p=>p.type.startsWith('breadboard')),current.part];
      else {
        const boards=placed.filter(p=>p.type.startsWith('breadboard')).sort((a,b)=>Math.hypot(a.x-current.part.x,a.y-current.part.y)-Math.hypot(b.x-current.part.x,b.y-current.part.y));
        placed=[current.part,...boards.slice(0,1)];
      }
    }
    if(!placed.length)return [{x:0,y:0},{x:680,y:230}];
    return placed.flatMap(p=>{const b=partBounds(p);return [{x:b.x,y:b.y-28},{x:b.x+b.w,y:b.y+b.h}];});
  },[frame,parts]);
  const fit=useCallback(()=>{
    const xs=focus.map(p=>p.x),ys=focus.map(p=>p.y),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    const zoom=Math.min(2.5,Math.max(.05,Math.min(size.w/(x1-x0+150),size.h/(y1-y0+110))));
    setViewport({zoom,x:size.w/2-(x0+x1)/2*zoom,y:size.h/2-(y0+y1)/2*zoom});
  },[focus,size]);
  useLayoutEffect(()=>{const node=container.current;if(!node)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize(s=>s.w===r.width&&s.h===r.height?s:{w:r.width,h:r.height});});observer.observe(node);return()=>observer.disconnect();},[]);
  useLayoutEffect(()=>fit(),[fit,cursor]);
  useEffect(()=>setSelected(null),[cursor]);
  const zoomAt=useCallback((factor:number,point:Vec)=>setViewport(v=>{const zoom=Math.max(.05,Math.min(8,v.zoom*factor)),r=zoom/v.zoom;return{zoom,x:point.x-(point.x-v.x)*r,y:point.y-(point.y-v.y)*r};}),[]);
  useEffect(()=>{const node=svg.current;if(!node)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=node.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[zoomAt]);
  const endGesture=(node:SVGSVGElement,pointerId:number)=>{
    gesture.current=null;setPanning(false);
    if(node.hasPointerCapture(pointerId))node.releasePointerCapture(pointerId);
  };
  const current=frame.current,z=viewport.zoom;
  const ghost=current?.kind==='part'?current.part:null,activeWire=current?.kind==='wire'?current.wire:null;
  const ends=activeWire?[endPosition(activeWire.a,parts),endPosition(activeWire.b,parts)]:[];
  const wireText=(w:WireData)=>`${assemblyEndLabel(w.a,snapshot)} → ${assemblyEndLabel(w.b,snapshot)}`;
  const selectedPart=selected?.kind==='part'?(ghost?.id===selected.id?ghost:frame.snapshot.parts.find(p=>p.id===selected.id)):undefined;
  const selectedWire=selected?.kind==='wire'?(activeWire?.id===selected.id?activeWire:frame.snapshot.wires.find(w=>w.id===selected.id)):undefined;
  const selectedStep=selected?plan.steps.findIndex(s=>selected.kind==='part'?s.kind==='part'&&s.part.id===selected.id:s.kind==='wire'&&s.wire.id===selected.id):-1;
  const wire=(w:WireData,active:boolean)=><g key={w.id} data-assembly-wire={w.id} className="assembly-wire" opacity={active||selected?.id===w.id?1:.6}>
    <title>{wireText(w)}</title>
    <WireShape points={wirePoints(w,parts)} color={w.color} hovered={active} selected={selected?.id===w.id}/>
  </g>;
  return <div ref={container} className={`assembly-stage ${panning?'is-panning':''}`} aria-label="Vista guiada de montaje">
    <svg ref={svg} width="100%" height="100%" tabIndex={0} aria-label="Montaje progresivo. Haz clic en una pieza para identificarla, arrastra para mover, usa la rueda para acercar y las flechas para revisar pasos."
      onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();navigate(frame.index+(e.key==='ArrowRight'?1:-1));}if(e.key==='Home'){e.preventDefault();navigate(0);}if(e.key==='Escape')setSelected(null);}}
      // Sin esto, pulsar la rueda activa el autodesplazamiento del navegador y el cursor queda atrapado.
      onMouseDown={e=>{if(e.button===1)e.preventDefault();}}
      onAuxClick={e=>{if(e.button===1)e.preventDefault();}}
      onPointerDown={e=>{
        if(e.button!==0&&e.button!==1)return;
        if(e.button===1)e.preventDefault();
        if(gesture.current)endGesture(e.currentTarget,gesture.current.id);
        e.currentTarget.focus({preventScroll:true});
        try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* puntero ya liberado: el gesto sigue sin captura */}
        gesture.current={id:e.pointerId,button:e.button,x:e.clientX,y:e.clientY,vx:viewport.x,vy:viewport.y,moved:e.button===1,pick:e.button===0?pickAt(e.target):null};
        if(e.button===1)setPanning(true);
      }}
      onPointerMove={e=>{
        const g=gesture.current;if(!g||g.id!==e.pointerId)return;
        const dx=e.clientX-g.x,dy=e.clientY-g.y;
        if(!g.moved){if(Math.hypot(dx,dy)<DRAG_THRESHOLD)return;g.moved=true;setPanning(true);}
        // Se calcula aquí y no dentro del actualizador: React puede ejecutarlo cuando el gesto ya terminó.
        const x=g.vx+dx,y=g.vy+dy;
        setViewport(v=>({...v,x,y}));
      }}
      onPointerUp={e=>{
        const g=gesture.current;if(!g||g.id!==e.pointerId)return;
        if(!g.moved&&g.button===0){const pick=g.pick;setSelected(s=>pick&&!(s?.kind===pick.kind&&s.id===pick.id)?pick:null);}
        endGesture(e.currentTarget,e.pointerId);
      }}
      onPointerCancel={e=>endGesture(e.currentTarget,e.pointerId)}
      onLostPointerCapture={e=>{if(gesture.current?.id===e.pointerId){gesture.current=null;setPanning(false);}}}>
      <defs><pattern id="assembly-grid" width={24} height={24} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={.7} fill="#a2aab1" opacity={.13}/></pattern></defs>
      <rect width="100%" height="100%" fill="url(#assembly-grid)"/>
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${z})`}>
        {frame.snapshot.parts.map(p=><AssemblyArtwork key={p.id} part={p}/>)}
        {frame.snapshot.wires.map(w=>wire(w,false))}
        {ghost&&<AssemblyArtwork key={ghost.id} part={ghost} ghost/>}
        {ghost&&(()=>{const b=partBounds(ghost);return <rect pointerEvents="none" x={b.x-5} y={b.y-5} width={b.w+10} height={b.h+10} rx={4/z} fill="none" stroke="#8bd8b8" strokeWidth={1.25/z} strokeDasharray={`${5/z} ${4/z}`}/>;})()}
        {activeWire&&<g data-pending-wire={activeWire.id}>{wire(activeWire,true)}{ends.map((p,i)=><g key={i} pointerEvents="none"><circle cx={p.x} cy={p.y} r={8/z} fill="#9ce4c1" fillOpacity={.15} stroke="#9ce4c1" strokeWidth={1.25/z}/><circle cx={p.x} cy={p.y} r={2/z} fill="#d7f8e6"/></g>)}</g>}
        {selectedPart&&(()=>{const b=partBounds(selectedPart);return <rect pointerEvents="none" x={b.x-7} y={b.y-7} width={b.w+14} height={b.h+14} rx={5/z} fill="#5aa9ff" fillOpacity={.08} stroke="#5aa9ff" strokeWidth={1.75/z}/>;})()}
      </g>
    </svg>
    {cursor===null&&<div className="assembly-stage-empty"><span>Mesa de montaje vacía</span><small>Las piezas aparecerán al avanzar.</small></div>}
    {cursor!==null&&<div className="assembly-stage-caption"><span>{ghost?'Por colocar':activeWire?'Cable actual':'Vista de conjunto'}</span><strong>{ghost?String(ghost.props.label||PARTS[ghost.type].name):activeWire?'Conecta los extremos resaltados':'Todas las piezas y conexiones'}</strong></div>}
    {(selectedPart||selectedWire)&&<div className="assembly-stage-inspect" role="status">
      <div>
        <span>{selectedPart?(PARTS[selectedPart.type]?.name&&PARTS[selectedPart.type].name!==partTitle(selectedPart)?PARTS[selectedPart.type].name:'Pieza'):'Cable'}</span>
        <strong title={selectedPart?partTitle(selectedPart):wireText(selectedWire!)}>{selectedPart?partTitle(selectedPart):wireText(selectedWire!)}</strong>
      </div>
      {selectedStep>=0&&selectedStep!==frame.index&&<HintButton className="btn ghost sm" onClick={()=>navigate(selectedStep)}>Ir al paso {selectedStep+1}</HintButton>}
      <HintButton className="icon-btn" aria-label="Quitar selección" onClick={()=>setSelected(null)}><X size={14}/></HintButton>
    </div>}
    {cursor!==null&&<div className="assembly-stage-tools" role="toolbar" aria-label="Vista del montaje">
      <Hand size={14}/><span className="assembly-pan-hint">Arrastra para mover · clic para identificar</span><span className="sep"/>
      <HintButton className="icon-btn" aria-label="Alejar montaje" onClick={()=>zoomAt(1/1.25,{x:size.w/2,y:size.h/2})}><Minus size={14}/></HintButton>
      <span className="assembly-zoom">{Math.round(z*100)}%</span>
      <HintButton className="icon-btn" aria-label="Acercar montaje" onClick={()=>zoomAt(1.25,{x:size.w/2,y:size.h/2})}><Plus size={14}/></HintButton>
      <HintButton className="icon-btn" aria-label="Enfocar paso actual" title="Enfocar paso actual" onClick={fit}><Maximize size={14}/></HintButton>
    </div>}
  </div>;
}
