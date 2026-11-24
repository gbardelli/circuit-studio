// Proyectos recientes de este navegador. Módulo aparte para que el editor lo use sin cargar la portada.
import type { ProjectSummary } from '../cloud';
import type { CircuitSnapshot } from '../core/types';

export interface Person {
  id: string;
  name: string | null;
  image: string | null;
}

export interface Recent {
  room: string;
  name: string;
  at: number;
  snapshot?: CircuitSnapshot;
  role?: ProjectSummary['role'];
  members?: number;
  people?: Person[];
}

export function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem('cs-projects') ?? '[]') as Recent[];
  } catch {
    return [];
  }
}

export function writeRecent(list: Recent[]) {
  try {
    localStorage.setItem('cs-projects', JSON.stringify(list.slice(0, 24)));
  } catch {
    /* sin persistencia */
  }
}

export function rememberProject(room: string, name: string, snapshot?: CircuitSnapshot) {
  const list = readRecent().filter((r) => r.room !== room);
  const json = snapshot ? JSON.stringify(snapshot) : '';
  list.unshift({ room, name, at: Date.now(), snapshot: json.length < 150_000 ? snapshot : undefined });
  writeRecent(list);
}

