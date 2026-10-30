import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { Presence, Project } from '../collab/project';
import type { SimStatus } from '../sim/engine';
import type { SimClient } from '../sim/client';
import type { Visual } from '../parts/types';
import type { ProjectDetail } from '../cloud';

export interface EditorCtx {
  project: Project;
  engine: SimClient;
  /** Datos del proyecto en la nube (rol, miembros, acceso por enlace); null en local. */
  detail?: ProjectDetail | null;
}

export const EditorContext = createContext<EditorCtx | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('EditorContext no disponible');
  return ctx;
}

export function useSnapshot() {
  const { project } = useEditor();
  return useSyncExternalStore(
    useCallback((fn) => project.subscribe(fn), [project]),
    () => project.snapshot(),
  );
}

export function useDisplaySnapshot() {
  const {project,engine}=useEditor();
  return useSyncExternalStore(useCallback(fn=>{const a=project.subscribe(fn),b=engine.subscribeStatus(fn);return()=>{a();b();};},[project,engine]),()=>engine.playbackScene??project.snapshot());
}

let peersCache: { key: string; value: Presence[] } = { key: '', value: [] };
export function usePeers(): Presence[] {
  const { project } = useEditor();
  return useSyncExternalStore(
    useCallback((fn) => project.subscribe(fn), [project]),
    () => {
      const peers = project.peers();
      const key = JSON.stringify(peers);
      if (key !== peersCache.key) peersCache = { key, value: peers };
      return peersCache.value;
    },
  );
}

export function useConnection() {
  const { project } = useEditor();
  return useSyncExternalStore(
    useCallback((fn) => project.subscribe(fn), [project]),
    () => `${project.connection}|${project.synced ? 1 : 0}|${project.name}`,
  );
}

export function useVisual(partId: string): Visual | null {
  const { engine } = useEditor();
  return useSyncExternalStore(
    useCallback((fn) => engine.subscribePart(partId, fn), [engine, partId]),
    () => engine.getVisual(partId),
  );
}

export function useSimStatus(): SimStatus {
  const { engine } = useEditor();
  return useSyncExternalStore(
    useCallback((fn) => engine.subscribeStatus(fn), [engine]),
    () => engine.status,
  );
}

export function useLab() {
  const {engine}=useEditor();
  return useSyncExternalStore(useCallback(fn=>engine.subscribeStatus(fn),[engine]),()=>engine.lab);
}
