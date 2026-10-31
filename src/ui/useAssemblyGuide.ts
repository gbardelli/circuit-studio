import { useMemo } from 'react';
import { LOCAL_ORIGIN } from '../collab/project';
import { useEditor, useSnapshot } from './context';
import { useUi } from './store';
import { assemblyFrame, buildAssemblyPlan, type AssemblyStep } from './assembly-plan';

export function useAssemblyGuide() {
  const {project}=useEditor(),snapshot=useSnapshot();
  const cursor=useUi(s=>s.assemblyCursor),go=useUi(s=>s.setAssemblyCursor),local=useUi(s=>s.assemblyLocalDone);
  const plan=useMemo(()=>buildAssemblyPlan(snapshot),[snapshot]);
  const frame=useMemo(()=>assemblyFrame(snapshot,plan,cursor),[snapshot,plan,cursor]);
  const savedParts=(project.meta.get('assembly.parts')??{}) as Record<string,string>;
  const savedWires=(project.meta.get('assembly.done')??{}) as Record<string,string>;
  const isDone=(step:AssemblyStep)=>project.readOnly ? local[step.key]===step.signature : (step.kind==='part'?savedParts[step.part.id]:savedWires[step.wire.id])===step.signature;
  const completed=plan.steps.filter(isDone).length;
  const firstPending=plan.steps.findIndex(s=>!isDone(s));
  const navigate=(index:number)=>go(index<0?null:index>=plan.steps.length?'end':plan.steps[index].key);
  const unconfirm=(step:AssemblyStep)=>{
    if(project.readOnly)useUi.setState(state=>{
      const next={...state.assemblyLocalDone};delete next[step.key];return{assemblyLocalDone:next};
    });
    else {
      const key=step.kind==='part'?'assembly.parts':'assembly.done',id=step.kind==='part'?step.part.id:step.wire.id;
      const next={...(project.meta.get(key)??{}) as Record<string,string>};delete next[id];project.setMeta(key,next);
    }
  };
  const resetProgress=()=>{
    const before={parts:{...(project.meta.get('assembly.parts')??{}) as Record<string,string>},wires:{...(project.meta.get('assembly.done')??{}) as Record<string,string>},local:{...useUi.getState().assemblyLocalDone},cursor:useUi.getState().assemblyCursor};
    if(project.readOnly)useUi.setState({assemblyLocalDone:{}});
    else project.doc.transact(()=>{project.meta.set('assembly.parts',{});project.meta.set('assembly.done',{});},LOCAL_ORIGIN);
    go(null);
    return ()=>{
      if(project.readOnly)useUi.setState(s=>({assemblyLocalDone:{...before.local,...s.assemblyLocalDone}}));
      else project.doc.transact(()=>{
        project.meta.set('assembly.parts',{...before.parts,...(project.meta.get('assembly.parts')??{}) as Record<string,string>});
        project.meta.set('assembly.done',{...before.wires,...(project.meta.get('assembly.done')??{}) as Record<string,string>});
      },LOCAL_ORIGIN);
      go(before.cursor);
    };
  };
  const confirm=()=>{
    const step=frame.current;if(!step)return;
    if(!isDone(step)) {
      if(project.readOnly)useUi.getState().setAssemblyLocalDone(step.key,step.signature);
      else {
        const key=step.kind==='part'?'assembly.parts':'assembly.done',id=step.kind==='part'?step.part.id:step.wire.id;
        project.setMeta(key,{...(project.meta.get(key)??{}) as Record<string,string>,[id]:step.signature});
      }
    }
    navigate(frame.index+1);
  };
  return {project,snapshot,plan,frame,cursor,completed,firstPending,isDone,navigate,confirm,unconfirm,resetProgress};
}
