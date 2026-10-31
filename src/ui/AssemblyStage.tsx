import { HintButton } from './Overlays';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hand, Maximize, Minus, Plus } from 'lucide-react';
import type { PartData, Vec } from '../core/types';
import { PARTS } from '../parts';
import { endPosition, partBounds, wirePoints } from './geometry';
import { WireShape } from './wires';
import { useAssemblyGuide } from './useAssemblyGuide';

export const AssemblyArtwork=memo(function AssemblyArtwork({part,ghost=false}:{part:PartData;ghost?:boolean}){
  const def=PARTS[part.type];
  const rendered=useMemo(()=>({...part,id:`assembly-stage-${part.id}`}),[part]);
  return <g data-assembly-part={part.id} data-pending={ghost?'true':undefined} className={`assembly-art ${ghost?'pending':''}`} transform={`translate(${part.x} ${part.y}) rotate(${part.rot})`}><def.Render part={rendered} visual={null} preview/></g>;
});

export function AssemblyStage() {
  const {snapshot,frame,cursor,navigate}=useAssemblyGuide();
  const container=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
  const [size,setSize]=useState({w:800,h:400}),[viewport,setViewport]=useState({x:0,y:0,zoom:1});
  const drag=useRef<{x:number;y:number;vx:number;vy:number}|null>(null);
  const [panning,setPanning]=useState(false);
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
  const zoomAt=useCallback((factor:number,point:Vec)=>setViewport(v=>{const zoom=Math.max(.05,Math.min(8,v.zoom*factor)),r=zoom/v.zoom;return{zoom,x:point.x-(point.x-v.x)*r,y:point.y-(point.y-v.y)*r};}),[]);
  useEffect(()=>{const node=svg.current;if(!node)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=node.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[zoomAt]);
  const current=frame.current,z=viewport.zoom;
  const ghost=current?.kind==='part'?current.part:null,activeWire=current?.kind==='wire'?current.wire:null;
  const ends=activeWire?[endPosition(activeWire.a,parts),endPosition(activeWire.b,parts)]:[];
  return <div ref={container} className={`assembly-stage ${panning?'is-panning':''}`} aria-label="Vista guiada de montaje">
    <svg ref={svg} width="100%" height="100%" tabIndex={0} aria-label="Montaje progresivo. Usa las flechas para revisar pasos y la rueda para acercar."
      onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();navigate(frame.index+(e.key==='ArrowRight'?1:-1));}if(e.key==='Home'){e.preventDefault();navigate(0);}}}
      onPointerDown={e=>{if(e.button!==0&&e.button!==1)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,vx:viewport.x,vy:viewport.y};setPanning(true);}}
      onPointerMove={e=>{if(!drag.current)return;setViewport(v=>({...v,x:drag.current!.vx+e.clientX-drag.current!.x,y:drag.current!.vy+e.clientY-drag.current!.y}));}}
      onPointerUp={e=>{drag.current=null;setPanning(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{drag.current=null;setPanning(false);}}>
      <defs><pattern id="assembly-grid" width={24} height={24} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={.7} fill="#a2aab1" opacity={.13}/></pattern></defs>
      <rect width="100%" height="100%" fill="url(#assembly-grid)"/>
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${z})`} pointerEvents="none">
        {frame.snapshot.parts.map(p=><AssemblyArtwork key={p.id} part={p}/>)}
        {frame.snapshot.wires.map(w=><g key={w.id} data-assembly-wire={w.id} opacity={activeWire?.id===w.id?1:.6}><WireShape points={wirePoints(w,parts)} color={w.color}/></g>)}
        {ghost&&<AssemblyArtwork key={ghost.id} part={ghost} ghost/>}
        {ghost&&(()=>{const b=partBounds(ghost);return <rect x={b.x-5} y={b.y-5} width={b.w+10} height={b.h+10} rx={4/z} fill="none" stroke="#8bd8b8" strokeWidth={1.25/z} strokeDasharray={`${5/z} ${4/z}`}/>;})()}
        {activeWire&&<g data-pending-wire={activeWire.id}><WireShape points={wirePoints(activeWire,parts)} color={activeWire.color} hovered/>{ends.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r={8/z} fill="#9ce4c1" fillOpacity={.15} stroke="#9ce4c1" strokeWidth={1.25/z}/><circle cx={p.x} cy={p.y} r={2/z} fill="#d7f8e6"/></g>)}</g>}
      </g>
    </svg>
    {cursor===null&&<div className="assembly-stage-empty"><span>Mesa de montaje vacía</span><small>Las piezas aparecerán al avanzar.</small></div>}
    {cursor!==null&&<div className="assembly-stage-caption"><span>{ghost?'Por colocar':activeWire?'Cable actual':'Vista de conjunto'}</span><strong>{ghost?String(ghost.props.label||PARTS[ghost.type].name):activeWire?'Conecta los extremos resaltados':'Todas las piezas y conexiones'}</strong></div>}
    {cursor!==null&&<div className="assembly-stage-tools" role="toolbar" aria-label="Vista del montaje">
      <Hand size={14}/><span className="assembly-pan-hint">Arrastra para mover</span><span className="sep"/>
      <HintButton className="icon-btn" aria-label="Alejar montaje" onClick={()=>zoomAt(1/1.25,{x:size.w/2,y:size.h/2})}><Minus size={14}/></HintButton>
      <span className="assembly-zoom">{Math.round(z*100)}%</span>
      <HintButton className="icon-btn" aria-label="Acercar montaje" onClick={()=>zoomAt(1.25,{x:size.w/2,y:size.h/2})}><Plus size={14}/></HintButton>
      <HintButton className="icon-btn" aria-label="Enfocar paso actual" title="Enfocar paso actual" onClick={fit}><Maximize size={14}/></HintButton>
    </div>}
  </div>;
}
