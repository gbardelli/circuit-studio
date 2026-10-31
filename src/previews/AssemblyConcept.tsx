import { useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, List, Maximize, Minus, PanelLeft, Plus, Printer, RotateCcw, Share2, Undo2, X } from 'lucide-react';
import type { CircuitSnapshot } from '../core/types';
import { PARTS } from '../parts';
import { endPosition, wirePoints } from '../ui/geometry';
import { WireShape } from '../ui/wires';
import { holeLabel } from '../ui/assembly-plan';
import sceneData from './assembly-scene.json';
import './assembly-concept.css';

const scene = sceneData as unknown as CircuitSnapshot;
const parts = new Map(scene.parts.map(p=>[p.id,p]));
const boardName = '1 · Pulsadores y codificación';

export default function AssemblyConcept() {
  const [tab,setTab]=useState('Guía'),[index,setIndex]=useState(0),[done,setDone]=useState<number[]>([]);
  const [zoom,setZoom]=useState(1),[stepsOpen,setStepsOpen]=useState(false),[message,setMessage]=useState('');
  const [restore,setRestore]=useState<number[]|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),root=useRef<HTMLDivElement>(null);
  const wire=scene.wires[index],ends=[endPosition(wire.a,parts),endPosition(wire.b,parts)];
  const complete=done.includes(index),previousDone=index>0&&done.includes(index-1);
  function reset(){setRestore(done);setDone([]);setIndex(0);dialog.current?.close();setMessage('Progreso reiniciado.');}
  function unmark(target:number){setDone(s=>s.filter(i=>i!==target));setIndex(target);}
  async function share(){try{await navigator.clipboard.writeText(location.href);setMessage('Enlace de vista preliminar copiado.');}catch{setMessage('Puedes copiar el enlace desde la barra del navegador.');}}
  return <div className="ac-app" ref={root}>
    <header className="ac-project-bar">
      <a className="ac-brand" href="/" aria-label="Inicio de Circuit Studio"><svg viewBox="0 0 32 24" width="32" height="24" aria-hidden="true"><path d="M2 20h7V4h9v16h7V4h5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round"/></svg><span>circuit<strong>studio</strong></span></a>
      <span className="ac-divider"/><strong className="ac-project-name">PROYECTO-ARQUI</strong><span className="ac-preview-label">Vista preliminar</span>
      <button className="ac-button ac-share" onClick={()=>void share()}><Share2 size={19}/>Compartir</button><span className="ac-avatar" aria-label="Perfil de ejemplo">G</span>
    </header>
    <nav className="ac-workspace-bar" aria-label="Montaje">
      <button className="ac-button ac-icon" aria-label={stepsOpen?'Ocultar pasos':'Mostrar pasos'} aria-expanded={stepsOpen} onClick={()=>setStepsOpen(!stepsOpen)}><PanelLeft size={21}/></button><h1>Montaje</h1>
      <div className="ac-tabs" role="group" aria-label="Vistas del montaje">{['Guía','Materiales','Progreso'].map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
      <div className="ac-workspace-actions"><button className="ac-button ac-icon" aria-label="Imprimir vista preliminar" title="Imprimir" onClick={()=>window.print()}><Printer size={21}/></button><span className="ac-divider"/><button className="ac-button ac-icon" aria-label="Pantalla completa" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void root.current?.requestFullscreen().catch(()=>setMessage('Usa la opción de pantalla completa de tu navegador.'));}}><Maximize size={21}/></button></div>
    </nav>
    {tab==='Guía'?<>
      <section className="ac-canvas" aria-label="Circuito de ejemplo con componentes reales">
        <svg className="ac-circuit" viewBox="-590 -75 1330 380" role="img" aria-label="Arduino GIGA y protoboard. Los extremos del cable actual están resaltados.">
          <g transform={`translate(40 110) scale(${zoom}) translate(-40 -110)`}>
            {scene.parts.map(p=>{const Render=PARTS[p.type].Render;return <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}><Render part={p} visual={null} preview/></g>;})}
            {done.filter(i=>i!==index).map(i=><WireShape key={i} points={wirePoints(scene.wires[i],parts)} color={scene.wires[i].color}/>)}
            <WireShape points={wirePoints(wire,parts)} color={wire.color}/>
            {ends.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="8" fill={wire.color} fillOpacity=".18" stroke={wire.color} strokeWidth="1.7"/><circle cx={p.x} cy={p.y} r="3" fill="#fff"/>
              <line x1={p.x} y1={p.y+(i?10:-10)} x2={p.x+10} y2={p.y+(i?34:-34)} stroke="#c6cbd1" strokeWidth="1"/>
              <rect x={p.x-21} y={p.y+(i?34:-67)} width="300" height="44" rx="7" fill="#282b30" stroke="#ffffff25"/>
              <circle cx={p.x-7} cy={p.y+(i?56:-45)} r="4" fill={wire.color}/><text x={p.x+5} y={p.y+(i?64:-38)} fill="#f1f3f6" fontSize="22">{`${i?'Destino':'Origen'} · ${index?'−':'+'} ${i?'inferior':'superior'}`}</text>
            </g>)}
          </g>
        </svg>
        <div className="ac-zoom" role="toolbar" aria-label="Zoom"><button aria-label="Alejar" disabled={zoom<=.7} onClick={()=>setZoom(v=>Math.max(.7,v-.1))}><Minus size={20}/></button><button className="ac-zoom-value" aria-label="Restablecer zoom" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button aria-label="Acercar" disabled={zoom>=1.5} onClick={()=>setZoom(v=>Math.min(1.5,v+.1))}><Plus size={20}/></button><button aria-label="Ajustar circuito" onClick={()=>setZoom(1)}><Maximize size={19}/></button></div>
        {stepsOpen&&<aside className="ac-step-list" aria-label="Pasos de ejemplo"><div><h2>Alimentación</h2><button className="ac-icon" aria-label="Cerrar pasos" onClick={()=>setStepsOpen(false)}><X size={19}/></button></div><p>Dos pasos interactivos de ejemplo</p>{scene.wires.map((w,i)=><button key={w.id} aria-current={i===index?'step':undefined} onClick={()=>{setIndex(i);setStepsOpen(false);}}><span>{done.includes(i)?<Check size={18}/>:62+i}</span><span>{i?'Conectar tierra':'Conectar alimentación'}<small>Riel {i?'−':'+'} superior a inferior</small></span></button>)}</aside>}
      </section>
      <section className="ac-instruction" aria-label="Instrucciones del paso actual">
        <div className="ac-step-meta"><span>Alimentación<span className="ac-meta-divider"/>Paso {62+index} de 298</span><button className="ac-text-button" onClick={()=>setStepsOpen(!stepsOpen)}><List size={20}/>Ver pasos</button></div>
        <div className="ac-heading" aria-live="polite"><h2>{index?'Conecta los rieles de tierra':'Conecta la alimentación'}</h2><p>Une los dos rieles {index?'negativos':'positivos'} de la protoboard.</p></div>
        <div className="ac-connections">{[wire.a,wire.b].map((end,i)=><div key={i} className="ac-connection"><span>{i?'Destino':'Origen'}</span><p>{boardName}</p><strong>{holeLabel(end.pin!).replace(/^riel/,'Riel').replace(', columna',' · Columna')}</strong></div>)}<ArrowRight className="ac-connection-arrow" size={26}/></div>
        <footer className="ac-step-actions"><div className="ac-navigation"><button className="ac-button" disabled={index===0} onClick={()=>setIndex(0)}><ChevronLeft size={21}/>Anterior</button><button className="ac-button" disabled={index===scene.wires.length-1} onClick={()=>setIndex(1)}>Ver siguiente<ChevronRight size={21}/></button></div><div className="ac-completion">{(complete||previousDone)&&<button className="ac-text-button" onClick={()=>unmark(complete?index:index-1)}><Undo2 size={19}/>{complete?'Desmarcar cable':'Desmarcar anterior'}</button>}<button className={`ac-button ac-primary ${complete?'is-complete':''}`} onClick={()=>{setDone(s=>s.includes(index)?s:[...s,index]);setMessage('Cable marcado en esta vista preliminar.');}}><Check size={22}/>{complete?'Cable conectado':'Confirmar conexión'}</button></div></footer>
      </section>
    </>:<section className="ac-detail-view"><div className="ac-detail-heading"><span>Montaje</span><h2>{tab==='Materiales'?'Lista de materiales':'Tu progreso'}</h2><p>{tab==='Materiales'?'Componentes de esta vista preliminar.':'El avance de esta vista es local y no modifica tu proyecto.'}</p></div>{tab==='Materiales'?<table><thead><tr><th>Componente</th><th>Cantidad</th></tr></thead><tbody>{Object.entries(scene.parts.reduce<Record<string,number>>((a,p)=>({...a,[p.type]:(a[p.type]??0)+1}),{})).map(([type,count])=><tr key={type}><td>{PARTS[type].name}</td><td>{count}</td></tr>)}</tbody></table>:<div className="ac-progress-content"><strong>{done.length}<span> / 2 pasos de ejemplo</span></strong><progress value={done.length} max={2}/><button className="ac-button" onClick={()=>{setIndex(0);setTab('Guía');}}>Revisar desde el principio<ArrowRight size={20}/></button><p>Conserva las marcas de los pasos completados.</p><button className="ac-text-button" disabled={!done.length} onClick={()=>dialog.current?.showModal()}><RotateCcw size={18}/>Reiniciar progreso…</button></div>}</section>}
    {message&&<div className="ac-notice" role="status"><span>{message}</span>{restore&&<button onClick={()=>{setDone(s=>[...new Set([...restore,...s])]);setRestore(null);setMessage('Progreso recuperado.');}}>Deshacer reinicio</button>}<button aria-label="Cerrar aviso" onClick={()=>setMessage('')}><X size={17}/></button></div>}
    <dialog className="ac-dialog" ref={dialog}><h2>¿Empezar de cero?</h2><p>Se quitarán las marcas de los dos pasos de ejemplo. Tu proyecto original no se modifica.</p><div><button className="ac-button" autoFocus onClick={()=>dialog.current?.close()}>Cancelar</button><button className="ac-button ac-primary" onClick={reset}>Reiniciar progreso</button></div></dialog>
  </div>;
}
