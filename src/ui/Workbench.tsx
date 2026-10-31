import { HintButton, OverlayScope } from './Overlays';
import {
  Activity,
  Maximize2,
  Minimize2,
  Command,
  Hammer,
  MessageSquare,
  ScanLine,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from 'react';
import { AssemblyStage } from './AssemblyStage';
import { useUi } from "./store";
import { useSimStatus } from "./context";
import { Signals } from "./Signals";
import { Diagnostics } from "./Diagnostics";
import { Assembly } from "./Assembly";
import { Notes } from "./Notes";
import { CommandPalette } from "./CommandPalette";
const TABS = [
  { id: "signals", name: "Señales", icon: Activity },
  { id: "diagnostics", name: "Diagnóstico", icon: ScanLine },
  { id: "assembly", name: "Montaje", icon: Hammer },
  { id: "notes", name: "Comentarios", icon: MessageSquare },
] as const;
export function WorkbenchRail() {
  const panel = useUi((s) => s.labPanel),
    set = useUi((s) => s.setLabPanel),
    status = useSimStatus();
  return (
    <div className="workbench-rail">
      <div className="workbench-label">
        <span className={`workbench-led ${status.running ? "live" : ""}`} />
        <strong>Workbench</strong>
        <span>
          {status.running ? "Simulación activa" : "Diseña · conecta · verifica"}
        </span>
      </div>
      <div
        className="workbench-tools"
        role="toolbar"
        aria-label="Herramientas de laboratorio"
      >
        {TABS.map((t) => (
          <HintButton
            key={t.id}
            data-lab-panel={t.id}
            hint={t.id==='signals'?'Observar señales y recorrer el tiempo':t.id==='assembly'?'Construir el circuito paso a paso':t.id==='diagnostics'?'Revisar conexiones y niveles eléctricos':'Revisiones ancladas al circuito'}
            className={panel === t.id ? "active" : ""}
            aria-pressed={panel === t.id}
            onClick={() => set(panel === t.id ? null : t.id)}
          >
            <t.icon size={14} />
            <span>{t.name}</span>
          </HintButton>
        ))}
        <HintButton
          className="command-trigger"
          onClick={() => useUi.getState().setCommandOpen(true)}
          aria-label="Abrir comandos"
        >
          <Command size={14} />
          <kbd> K</kbd>
        </HintButton>
      </div>
    </div>
  );
}
export function clampPanelHeight(height:number,available:number) {
  const max=Math.max(180,available-140);
  return Math.max(Math.min(200,max),Math.min(max,height));
}

export function WorkbenchPanel() {
  const panel=useUi(s=>s.labPanel),set=useUi(s=>s.setLabPanel),full=useUi(s=>s.labFullscreen),setFull=useUi(s=>s.setLabFullscreen),sizes=useUi(s=>s.labSizes),setSize=useUi(s=>s.setLabSize),assemblyTab=useUi(s=>s.assemblyTab);
  const node=useRef<HTMLElement>(null),expand=useRef<HTMLButtonElement>(null);
  const [available,setAvailable]=useState(typeof window==='undefined'?700:window.innerHeight-100),[dragHeight,setDragHeight]=useState<number|null>(null);
  const resize=useRef<{y:number;height:number;last:number;available:number}|null>(null);
  const height=clampPanelHeight(dragHeight??(panel?sizes[panel]:280),available);
  useEffect(()=>{resize.current=null;setDragHeight(null);},[panel,full]);
  useEffect(()=>{
    const parent=node.current?.closest('.workspace');if(!parent)return;
    const observer=new ResizeObserver(entries=>setAvailable(entries[0].contentRect.height));observer.observe(parent);return()=>observer.disconnect();
  },[panel]);
  useEffect(()=>{
    if(!full||!node.current)return;
    const root=node.current;
    const focusFrame=requestAnimationFrame(()=>expand.current?.focus());
    const background=Array.from(document.querySelectorAll<HTMLElement>('.app > header,.app > aside,.app > footer,.app > .compact-panels,.workspace > .workbench-rail,.workspace > .canvas-wrap,.workspace > .editor-canvas-slot,.workspace > .assembly-stage'));
    const previous=background.map(el=>({el,inert:el.inert}));previous.forEach(({el})=>{el.inert=true;});
    const key=(e:KeyboardEvent)=>{
      if(useUi.getState().commandOpen)return;
      if(root.querySelector('[data-menu-popup]')||(e.key==='Escape'&&document.querySelector('.ui-tooltip[data-open]')))return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setFull(false);requestAnimationFrame(()=>expand.current?.focus());}
      if(e.key==='Tab'){
        const focusable=Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length>0&&!el.closest('[hidden]'));
        const first=focusable[0],last=focusable.at(-1);if(!first)return;
        if(!root.contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first)?.focus();return;}
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    window.addEventListener('keydown',key,true);return()=>{cancelAnimationFrame(focusFrame);window.removeEventListener('keydown',key,true);previous.forEach(({el,inert})=>{el.inert=inert;});if(!useUi.getState().labPanel)requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-lab-panel="${panel}"]`)?.focus());};
  },[full,setFull,panel]);
  const assemblyFull=full&&panel==='assembly'&&assemblyTab==='steps';
  return <><CommandPalette/>{panel&&<section ref={node} className={`workbench-panel workbench-flexible ${full?'is-fullscreen':''} ${resize.current?'is-resizing':''}`} data-panel={panel} role={full?'dialog':'region'} aria-modal={full||undefined} aria-label={`Panel de ${TABS.find(t=>t.id===panel)?.name}`} style={full?undefined:{height}}>
    {!full&&<div className="workbench-resizer" role="separator" aria-label="Ajustar altura del laboratorio" aria-orientation="horizontal" aria-valuenow={Math.round(height)} aria-valuemin={180} aria-valuemax={Math.round(Math.max(180,available-140))} tabIndex={0} title="Arrastra para ajustar · Doble clic para restablecer"
      onDoubleClick={()=>setSize(panel,panel==='signals'?320:280)}
      onKeyDown={e=>{let value:number|undefined;if(e.key==='ArrowUp')value=height+(e.shiftKey?50:20);if(e.key==='ArrowDown')value=height-(e.shiftKey?50:20);if(e.key==='Home')value=180;if(e.key==='End')value=available-140;if(value!==undefined){e.preventDefault();e.stopPropagation();setSize(panel,clampPanelHeight(value,available));}}}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);resize.current={y:e.clientY,height,last:height,available};setDragHeight(height);}}
      onPointerMove={e=>{const r=resize.current;if(!r)return;r.last=clampPanelHeight(r.height+r.y-e.clientY,r.available);setDragHeight(r.last);}}
      onPointerUp={e=>{if(!resize.current)return;setSize(panel,resize.current.last);resize.current=null;setDragHeight(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{resize.current=null;setDragHeight(null);}}><span/></div>}
    <div className="workbench-heading">
      {full?<div className="workbench-full-tabs" role="toolbar" aria-label="Secciones del laboratorio">{TABS.map(t=><HintButton key={t.id} aria-pressed={panel===t.id} onClick={()=>set(t.id)}><t.icon size={14}/>{t.name}</HintButton>)}</div>:<><span className="signal-dot"/><strong>{TABS.find(t=>t.id===panel)?.name}</strong></>}
      <span className="grow"/>
      <HintButton ref={expand} className="icon-btn" onClick={()=>setFull(!full)} aria-label={full?'Volver al tamaño anterior':'Ampliar laboratorio a pantalla completa'} title={full?'Volver al tamaño anterior · Esc':'Pantalla completa'}>{full?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</HintButton>
      <HintButton className="icon-btn" onClick={()=>set(null)} aria-label="Cerrar laboratorio" title="Cerrar laboratorio"><X size={15}/></HintButton>
    </div>
    <OverlayScope.Provider value={node}><div className={`workbench-body ${assemblyFull?'assembly-full-layout':''}`}>
      <div className="workbench-preview-slot" hidden={!assemblyFull}>{assemblyFull&&<AssemblyStage/>}</div>
      {panel==='signals'?<Signals key="signals"/>:panel==='diagnostics'?<Diagnostics key="diagnostics"/>:panel==='assembly'?<Assembly key="assembly"/>:<Notes key="notes"/>}
    </div></OverlayScope.Provider>
  </section>}</>;
}
