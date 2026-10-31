import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Y from 'yjs';
import { Project } from '../collab/project';
import { EditorContext } from './context';
import type { SimClient } from '../sim/client';
import { useAssemblyGuide } from './useAssemblyGuide';
import { useUi } from './store';

vi.mock('../cloud',()=>({CLOUD:false,sessionUser:()=>null,sessionToken:async()=>null,colorFor:()=> '#888'}));
const opened:Project[]=[];let renderer:ReactTestRenderer|undefined,guide:ReturnType<typeof useAssemblyGuide>;
function Harness(){guide=useAssemblyGuide();return <div/>;}
async function open(role:'owner'|'viewer'='owner'){
  const p=new Project(crypto.randomUUID(),role);opened.push(p);await p.persistence.whenSynced;return p;
}
function mount(project:Project){act(()=>{renderer=create(<EditorContext.Provider value={{project,engine:{} as SimClient}}><Harness/></EditorContext.Provider>);});}
beforeEach(()=>{vi.stubEnv('DEV',false);vi.stubEnv('VITE_COLLAB_URL','');useUi.getState().resetAssembly();});
afterEach(()=>{act(()=>renderer?.unmount());renderer=undefined;opened.splice(0).forEach(p=>p.destroy());vi.unstubAllEnvs();});
describe('assembly progress persistence',()=>{
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
