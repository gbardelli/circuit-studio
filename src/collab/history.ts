// Historial de versiones de un circuito. Con cuenta, en el servidor (lo comparte todo el equipo);
// sin cuenta, en este navegador. Una versión es el documento Yjs entero, en base64.
import { CLOUD, api } from '../cloud';
import type { CircuitSnapshot } from '../core/types';
import type { Project } from './project';

export type VersionKind = 'auto' | 'manual' | 'restore';

export interface VersionInfo {
  id: string;
  kind: VersionKind;
  label: string | null;
  author_name: string | null;
  parts: number;
  wires: number;
  created_at: string;
}

interface LocalVersion extends VersionInfo {
  state: string;
  preview: CircuitSnapshot;
}

/** Cada cuánto se guarda sola una versión mientras se edita. */
export const AUTO_EVERY_MS = 10 * 60_000;
const LOCAL_KEEP = 20;

function b64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(text: string) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const localKey = (room: string) => `cs-history:${room}`;

function readLocal(room: string): LocalVersion[] {
  try {
    return JSON.parse(localStorage.getItem(localKey(room)) ?? '[]') as LocalVersion[];
  } catch {
    return [];
  }
}

function writeLocal(room: string, list: LocalVersion[]) {
  // Si no cabe, se van descartando las automáticas más viejas.
  for (let keep = list; keep.length; ) {
    try {
      localStorage.setItem(localKey(room), JSON.stringify(keep));
      return;
    } catch {
      const i = keep.map((v) => v.kind).lastIndexOf('auto');
      keep = i >= 0 ? keep.filter((_, j) => j !== i) : keep.slice(0, -1);
    }
  }
}

export async function listVersions(room: string): Promise<VersionInfo[]> {
  if (CLOUD) return (await api<{ versions: VersionInfo[] }>(`/api/versions/${room}`)).versions.map((v) => ({ ...v, id: String(v.id) }));
  return readLocal(room).map(({ state: _state, preview: _preview, ...info }) => info);
}

export async function loadVersion(room: string, id: string): Promise<{ state: Uint8Array; preview: CircuitSnapshot | null }> {
  if (CLOUD) {
    const row = await api<{ state: string; preview: CircuitSnapshot | null }>(`/api/versions/${room}?v=${encodeURIComponent(id)}`);
    return { state: unb64(row.state), preview: row.preview };
  }
  const v = readLocal(room).find((x) => x.id === id);
  if (!v) throw new Error('Esa versión ya no existe');
  return { state: unb64(v.state), preview: v.preview };
}

/** Guarda una versión del circuito tal como está ahora. Las automáticas se saltan si nada cambió. */
export async function saveVersion(project: Project, kind: VersionKind, label?: string): Promise<boolean> {
  const snapshot = project.snapshot();
  const state = b64(project.encodeState());
  const info = { kind, label: label?.trim() || null, parts: snapshot.parts.length, wires: snapshot.wires.length };
  if (CLOUD) {
    const r = await api<{ skipped?: boolean }>(`/api/versions/${project.room}`, {
      method: 'POST',
      body: JSON.stringify({ ...info, state, preview: snapshot }),
    });
    return !r.skipped;
  }
  const list = readLocal(project.room);
  const last = list[0];
  if (kind === 'auto' && last && (last.state === state || Date.now() - Date.parse(last.created_at) < AUTO_EVERY_MS)) return false;
  list.unshift({ ...info, id: crypto.randomUUID(), author_name: project.user.name, created_at: new Date().toISOString(), state, preview: snapshot });
  writeLocal(project.room, list.slice(0, LOCAL_KEEP));
  return true;
}

/** Restaura una versión; antes guarda la actual para poder volver. */
export async function restoreVersion(project: Project, version: VersionInfo) {
  const { state } = await loadVersion(project.room, version.id);
  const when = new Date(version.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  await saveVersion(project, 'restore', `Antes de restaurar «${version.label ?? when}»`);
  project.restore(state);
}
