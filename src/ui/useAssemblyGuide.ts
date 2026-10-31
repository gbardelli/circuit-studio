import { useMemo } from 'react';
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
  const confirm=()=>{
    const step=frame.current;if(!step)return;
    if(!isDone(step)) {
      if(project.readOnly)useUi.getState().setAssemblyLocalDone(step.key,step.signature);
      else {
        const key=step.kind==='part'?'assembly.parts':'assembly.done',id=step.kind==='part'?step.part.id:step.wire.id;
        project.setMeta(key,{...(step.kind==='part'?savedParts:savedWires),[id]:step.signature});
      }
    }
    navigate(frame.index+1);
  };
  return {project,snapshot,plan,frame,cursor,completed,firstPending,isDone,navigate,confirm};
}
