import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Y from 'yjs';
import { Project } from '../collab/project';
import { EditorContext } from './context';
import type { SimClient } from '../sim/client';
import { useAssemblyGuide } from './useAssemblyGuide';
import { useUi } from './store';
import { AssemblySteps } from './AssemblySteps';
import { Materials } from './Materials';
import { materials } from './lab-utils';

vi.mock('../cloud',()=>({CLOUD:false,sessionUser:()=>null,sessionToken:async()=>null,colorFor:()=> '#888'}));
vi.mock('./Overlays',()=>({HintButton:(props:Record<string,unknown>)=><button {...props}/>,PopoverPanel:()=>null}));
const opened:Project[]=[];let renderer:ReactTestRenderer|undefined,guide:ReturnType<typeof useAssemblyGuide>;
function Harness({controls=false}:{controls?:boolean|'materials'}){guide=useAssemblyGuide();return controls==='materials'?<Materials exporting={false} onPdf={()=>{}}/>:controls?<AssemblySteps/>:<div/>;}
async function open(role:'owner'|'viewer'='owner'){
  const p=new Project(crypto.randomUUID(),role);opened.push(p);await p.persistence.whenSynced;return p;
}
function mount(project:Project,controls:boolean|'materials'=false){act(()=>{renderer=create(<EditorContext.Provider value={{project,engine:{} as SimClient}}><Harness controls={controls}/></EditorContext.Provider>);});}
beforeEach(()=>{vi.stubEnv('DEV',false);vi.stubEnv('VITE_COLLAB_URL','');useUi.getState().resetAssembly();});
afterEach(()=>{act(()=>renderer?.unmount());renderer=undefined;opened.splice(0).forEach(p=>p.destroy());vi.unstubAllEnvs();});
describe('assembly progress persistence',()=>{
  it('tracks purchased quantities without altering components and reopens a row when its quantity increases',async()=>{
    const project=await open();project.addPart('led',0,0);project.addPart('led',100,0);mount(project,'materials');
    const row=materials(project.snapshot())[0],source=structuredClone(project.snapshot());
    const checkbox=()=>renderer!.root.findAllByType('input').find(input=>input.props['aria-label']?.startsWith('Marcar como conseguido:'))!;
    await act(async()=>checkbox().props.onChange());
    expect(project.meta.get('assembly.purchased')).toEqual({[row.key]:2});expect(project.snapshot()).toEqual(source);expect(checkbox().props.checked).toBe(true);
    await act(async()=>{project.addPart('led',200,0);});expect(checkbox().props.checked).toBe(false);
    await act(async()=>{const activate=checkbox().props.onChange;activate();activate();});expect(checkbox().props.checked).toBe(false);
  });
  it('keeps the visitor shopping checklist local across panel remounts',async()=>{
    const owner=await open();owner.addPart('led',0,0);const row=materials(owner.snapshot())[0];owner.setMeta('assembly.purchased',{[row.key]:1});
    const viewer=await open('viewer');Y.applyUpdate(viewer.doc,Y.encodeStateAsUpdate(owner.doc));const metadata=structuredClone(viewer.meta.toJSON());mount(viewer,'materials');
    const checkbox=()=>renderer!.root.findAllByType('input').find(input=>input.props['aria-label']?.startsWith('Marcar como conseguido:'))!;
    expect(checkbox().props.checked).toBe(false);act(()=>checkbox().props.onChange());expect(checkbox().props.checked).toBe(true);
    act(()=>renderer!.unmount());renderer=undefined;mount(viewer,'materials');expect(checkbox().props.checked).toBe(true);expect(viewer.meta.toJSON()).toEqual(metadata);
  });
  it('accepts the second activation of a rapid click sequence',async()=>{
    const project=await open();project.addPart('breadboard-full',0,0);project.addPart('led',200,100);project.addPart('resistor',300,100);
    mount(project,true);act(()=>guide.navigate(0));
    const primary=()=>renderer!.root.findAllByType('button').find(b=>b.props.className==='btn primary')!;
    act(()=>primary().props.onClick({detail:1}));expect(guide.completed).toBe(1);
    act(()=>primary().props.onClick({detail:2}));expect(guide.completed).toBe(2);
    act(()=>primary().props.onClick({detail:0}));expect(guide.completed).toBe(3);
  });
  it('unmarks one wire without clearing placed parts or other connections',async()=>{
    const project=await open(),board=project.addPart('breadboard-full',0,0);
    project.addWire({part:board,pin:'tp1',x:0,y:0},{part:board,pin:'bp1',x:0,y:0},[],'#e6535b');
    project.addWire({part:board,pin:'tn2',x:0,y:0},{part:board,pin:'bn2',x:0,y:0},[],'#414954');
    const source=structuredClone(project.snapshot());mount(project);
    for(let i=0;i<3;i++){act(()=>guide.navigate(i));act(()=>guide.confirm());}
    const wire=guide.plan.steps.find(s=>s.kind==='wire')!;expect(guide.completed).toBe(3);
    await act(async()=>guide.unconfirm(wire));expect(guide.completed).toBe(2);expect(guide.isDone(wire)).toBe(false);
    expect(guide.isDone(guide.plan.steps[0])).toBe(true);expect(project.snapshot()).toEqual(source);
  });
  it('resets only progress and can restore it without overwriting new confirmations',async()=>{
    const project=await open();project.addPart('breadboard-full',0,0);project.addPart('led',200,100);project.addPart('resistor',300,100);
    project.setMeta('assembly.prices',{led:2});project.setMeta('note:test',{text:'Keep this note'});
    const source=structuredClone(project.snapshot());mount(project);
    act(()=>guide.navigate(0));act(()=>guide.confirm());act(()=>guide.confirm());
    let restore:()=>void=()=>{};act(()=>{restore=guide.resetProgress();});
    expect(guide.completed).toBe(0);expect(guide.cursor).toBeNull();expect(guide.frame.snapshot.parts).toHaveLength(0);
    expect(project.meta.get('assembly.prices')).toEqual({led:2});expect(project.meta.get('note:test')).toEqual({text:'Keep this note'});
    act(()=>guide.navigate(2));act(()=>guide.confirm());act(()=>restore());
    expect(guide.completed).toBe(3);expect(project.snapshot()).toEqual(source);
    act(()=>renderer!.unmount());renderer=undefined;useUi.getState().resetAssembly();mount(project);expect(guide.completed).toBe(3);
  });
  it('keeps visitor unmark, reset and undo local to their session',async()=>{
    const owner=await open();owner.addPart('breadboard-full',0,0);owner.addPart('led',200,100);
    const viewer=await open('viewer');Y.applyUpdate(viewer.doc,Y.encodeStateAsUpdate(owner.doc));
    const metadata=structuredClone(viewer.meta.toJSON()),source=structuredClone(viewer.snapshot());mount(viewer);
    act(()=>guide.navigate(0));act(()=>guide.confirm());act(()=>guide.confirm());
    act(()=>guide.unconfirm(guide.plan.steps[0]));expect(guide.completed).toBe(1);
    let restore:()=>void=()=>{};act(()=>{restore=guide.resetProgress();});expect(guide.completed).toBe(0);
    act(()=>restore());expect(guide.completed).toBe(1);expect(viewer.meta.toJSON()).toEqual(metadata);expect(viewer.snapshot()).toEqual(source);
  });
  it('records owner confirmation as metadata without changing the circuit',async()=>{
    const project=await open();project.addPart('breadboard-full',0,0);project.addPart('74hc08',90,100);
    const source=structuredClone(project.snapshot());mount(project);
    expect(guide.frame.snapshot.parts).toHaveLength(0);
    act(()=>guide.navigate(0));act(()=>guide.confirm());
    expect(guide.completed).toBe(1);expect(guide.frame.snapshot.parts).toHaveLength(1);
    expect(Object.keys(project.meta.get('assembly.parts') as object)).toHaveLength(1);
    expect(project.snapshot()).toEqual(source);
    act(()=>renderer!.unmount());renderer=undefined;useUi.getState().resetAssembly();mount(project);
    expect(guide.completed).toBe(1);expect(guide.firstPending).toBe(1);
  });
  it('lets visitors explore locally without inheriting or writing owner progress',async()=>{
    const owner=await open();owner.addPart('breadboard-full',0,0);owner.addPart('led',200,100);mount(owner);act(()=>guide.navigate(0));act(()=>guide.confirm());
    act(()=>renderer!.unmount());renderer=undefined;useUi.getState().resetAssembly();
    const viewer=await open('viewer');Y.applyUpdate(viewer.doc,Y.encodeStateAsUpdate(owner.doc));const metadata=structuredClone(viewer.meta.toJSON()),source=structuredClone(viewer.snapshot());mount(viewer);
    expect(guide.completed).toBe(0);act(()=>guide.navigate(0));act(()=>guide.confirm());expect(guide.completed).toBe(1);
    expect(viewer.meta.toJSON()).toEqual(metadata);expect(viewer.snapshot()).toEqual(source);
  });
});
