import { useState } from 'react';
import { HintButton, PopoverPanel } from './Overlays';
import { ArrowRight, Check, CheckCheck, ChevronLeft, ChevronRight, RotateCcw, Undo2 } from 'lucide-react';
import { PARTS } from '../parts';
import { formatSI } from '../core/units';
import type { PartData, WireEnd } from '../core/types';
import { partBounds } from './geometry';
import { ASSEMBLY_PHASES, holeLabel, orientationText, partTitle } from './assembly-plan';
import { useAssemblyGuide } from './useAssemblyGuide';
import { useUi } from './store';

function PieceThumbnail({part}:{part:PartData}) {
  const local={...part,id:`assembly-thumb-${part.id}`,x:0,y:0},b=partBounds(local),def=PARTS[part.type];
  return <svg className="assembly-piece-thumbnail" viewBox={`${b.x-8} ${b.y-8} ${b.w+16} ${b.h+16}`} aria-hidden="true"><g transform={`rotate(${part.rot})`}><def.Render part={local} visual={null} preview/></g></svg>;
}

export function AssemblySteps() {
  const {project,snapshot,plan,frame,cursor,completed,firstPending,isDone,navigate,confirm,unconfirm}=useAssemblyGuide();
  const [indexOpen,setIndexOpen]=useState(false);
  const step=frame.current,byId=new Map(snapshot.parts.map(p=>[p.id,p]));
  const previous=plan.steps[frame.index-1];
  const endpoint=(end:WireEnd,label:string)=>{
    const part=byId.get(end.part??'');
    return <div className="assembly-connection-point"><span>{label}</span><strong>{part?partTitle(part):'Extremo libre'}</strong><span className="assembly-terminal">{part?.type.startsWith('breadboard')?holeLabel(end.pin??'?'):`Pin ${end.pin??'?'}`}</span></div>;
  };
  const phase=step&&ASSEMBLY_PHASES.find(p=>p.id===step.phase);
  const phaseSteps=step?plan.steps.filter(s=>s.phase===step.phase):[];
  const phaseIndex=step?phaseSteps.findIndex(s=>s.key===step.key)+1:0;
  const progress=plan.steps.length?completed/plan.steps.length:0;
  if(!plan.steps.length)return <div className="assembly-guide assembly-welcome"><h2>Primero crea tu circuito</h2><p>La guía se genera a partir de sus piezas y sus conexiones físicas.</p><HintButton className="btn" onClick={()=>useUi.getState().setLabPanel(null)}>Volver al lienzo</HintButton></div>;
  return <div className="assembly-guide">
    <div className="assembly-guide-progress">
      <progress value={completed} max={plan.steps.length} aria-label={project.readOnly?'Pasos vistos':'Pasos confirmados'}/>
      <span>{completed} de {plan.steps.length} pasos {project.readOnly?'vistos':'completados'}</span>
      <PopoverPanel label="Pasos del montaje" className="ui-step-index" open={indexOpen} onOpenChange={setIndexOpen} trigger={<button className="assembly-index-trigger">Ver pasos</button>}>
        <div className="ui-menu-heading">Pasos del montaje<span>{plan.steps.length} pasos</span></div>
        <div className="ui-step-list">{ASSEMBLY_PHASES.map(p=><div key={p.id}><strong>{p.label}</strong>{plan.steps.filter(s=>s.phase===p.id).map(s=><div className="assembly-index-row" key={s.key}><button aria-current={s.key===cursor?'step':undefined} className={s.key===cursor?'current':''} onClick={()=>{navigate(plan.steps.indexOf(s));setIndexOpen(false);}}>{isDone(s)?<Check size={13}/>:<span className="assembly-step-dot"/>}<span>{s.title}</span></button>{isDone(s)&&<HintButton className="assembly-index-unmark" aria-label={`Desmarcar ${s.title}`} onClick={()=>unconfirm(s)}>Desmarcar</HintButton>}</div>)}</div>)}</div>
      </PopoverPanel>
    </div>
    {cursor===null ? <div className="assembly-welcome">
      <div><h2>Montaje paso a paso</h2><p>{plan.parts} piezas y {plan.wires} cables, uno a uno. En cada paso verás qué colocar, dónde va y cómo orientarlo.</p><small>{project.readOnly?'Puedes recorrer la guía sin modificar el proyecto.':'Confirma cada paso después de realizarlo en tu montaje físico.'}</small></div>
      <div className="assembly-welcome-actions"><HintButton className="btn primary" onClick={()=>navigate(completed>0&&firstPending>=0?firstPending:0)}>{completed>0&&firstPending>=0?'Continuar montaje':'Empezar montaje'}<ArrowRight size={15}/></HintButton>{completed>0&&<HintButton className="btn ghost" onClick={()=>navigate(0)}>Ver desde el principio</HintButton>}</div>
    </div> : !step ? <div className="assembly-welcome">
      <div><CheckCheck size={25}/><h2>{progress===1&&!project.readOnly?'Montaje completado.':'Llegaste al final de la guía.'}</h2><p>{completed} de {plan.steps.length} pasos {project.readOnly?'vistos':'confirmados'}. Puedes revisar cualquier pieza o volver al circuito.</p></div>
      <div className="assembly-welcome-actions"><HintButton className="btn primary" onClick={()=>useUi.getState().setLabPanel(null)}>Volver al circuito<ArrowRight size={15}/></HintButton>{firstPending>=0&&<HintButton className="btn ghost" onClick={()=>navigate(firstPending)}>Primer paso pendiente</HintButton>}<HintButton className="btn ghost" onClick={()=>navigate(0)}><RotateCcw size={14}/>Revisar desde el inicio</HintButton></div>
    </div> : <>
      <div className="assembly-current" key={step.key}>
        <div className="assembly-current-art">{step.kind==='part'?<PieceThumbnail part={step.part}/>:<span className="assembly-cable-sample" style={{color:step.wire.color}}><span/><i/><span/></span>}</div>
        <div className="assembly-current-copy" aria-live="polite" aria-atomic="true">
          <div className="assembly-current-meta"><span>{phase?.label} · {phaseIndex} de {phaseSteps.length}</span><span>Paso {frame.index+1} de {plan.steps.length}</span>{isDone(step)&&<span className="assembly-already-done"><Check size={12}/>{project.readOnly?'Visto':step.kind==='wire'?'Conectado':'Colocado'}</span>}</div>
          <h2>{step.kind==='part'?step.title:'Conecta los puntos resaltados'}</h2>
          {step.kind==='part'?<>
            <p>{step.owner?`En ${partTitle(byId.get(step.owner)!)}, coloca la pieza como se indica en el lienzo.`:'Coloca la pieza en la posición señalada en el lienzo.'} {orientationText(step.part)}</p>
            <div className="assembly-placement-summary">{step.placements.slice(0,2).map(p=><span key={`${p.pin}-${p.board}`}><strong>{p.pin}</strong><ArrowRight size={12}/>{holeLabel(p.hole)}</span>)}{typeof step.part.props.resistance==='number'&&<span>{formatSI(step.part.props.resistance,'Ω')}</span>}{typeof step.part.props.capacitance==='number'&&<span>{formatSI(step.part.props.capacitance,'F')}</span>}</div>
            {step.placements.length>2&&<details className="assembly-pinout"><summary>Ver las {step.placements.length} patillas</summary><dl>{step.placements.map(p=><div key={`${p.pin}-${p.board}`}><dt>{p.pin}</dt><dd>{p.board!==step.owner?`${partTitle(byId.get(p.board)!)} · `:''}{holeLabel(p.hole)}</dd></div>)}</dl></details>}
          </>:<div className="assembly-wire-endpoints">{endpoint(step.wire.a,'Origen')}<ArrowRight size={18}/>{endpoint(step.wire.b,'Destino')}</div>}
        </div>
      </div>
      <div className="assembly-guide-actions">
        <div className="assembly-step-navigation"><HintButton className="btn ghost" onClick={()=>navigate(frame.index-1)} aria-label="Paso anterior"><ChevronLeft size={16}/>Anterior</HintButton><HintButton className="btn ghost" onClick={()=>navigate(frame.index+1)} title="Avanza sin marcar este paso como completado">Ver siguiente<ChevronRight size={16}/></HintButton></div>
        <div className="assembly-step-completion">
          {isDone(step)?<HintButton className="btn" onClick={()=>unconfirm(step)}><Undo2 size={15}/>Desmarcar {step.kind==='wire'?'cable':'pieza'}</HintButton>:previous&&isDone(previous)&&<HintButton className="btn ghost" onClick={()=>{unconfirm(previous);navigate(frame.index-1);}}><Undo2 size={15}/>Desmarcar anterior</HintButton>}
          <HintButton className="btn primary" onClick={e=>{if(e.detail<2)confirm();}}>{isDone(step)?'Siguiente':project.readOnly?(step.kind==='part'?'Mostrar pieza':'Mostrar cable'):step.kind==='part'?'Pieza colocada':'Cable conectado'}{isDone(step)?<ArrowRight size={16}/>:<Check size={16}/>}</HintButton>
        </div>
      </div>
    </>}
  </div>;
}
