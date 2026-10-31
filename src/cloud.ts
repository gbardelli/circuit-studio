// Modo nube: con la clave pública de Clerk configurada, la app exige sesión, guarda los
// circuitos en Postgres y colabora por /api/ws. Sin ella (desarrollo local), todo funciona
// como antes: servidor de salas local o solo este navegador.
import type { CircuitSnapshot } from './core/types';

export const CLERK_KEY = (import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) as string | undefined;
export const CLOUD = Boolean(CLERK_KEY);

export type Role = 'owner' | 'editor' | 'viewer';
export type LinkAccess = 'none' | 'view' | 'edit';

export interface CloudUser {
  id: string;
  name: string;
  image: string | null;
}

let tokenGetter: (() => Promise<string | null>) | null = null;
let currentUser: CloudUser | null = null;

export function setSession(getToken: () => Promise<string | null>, user: CloudUser | null) {
  tokenGetter = getToken;
  currentUser = user;
}

export const sessionUser = () => currentUser;
export const sessionToken = async () => (tokenGetter ? await tokenGetter() : null);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await sessionToken();
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `Error ${res.status}`), { status: res.status });
  return body as T;
}

export interface ProjectSummary {
  id: string;
  name: string;
  preview: CircuitSnapshot | null;
  updated_at: string;
  owner_id: string;
  role: Role;
  members: number;
  /** Los primeros miembros, para mostrar sus caras. */
  people: { id: string; name: string | null; image: string | null }[];
}

export interface ProjectDetail {
  guest?: boolean;
  id: string;
  name: string;
  owner_id: string;
  link_access: LinkAccess;
  role: Role;
  members: { id: string; name: string; image: string | null; role: Role }[];
}

/** Color estable por usuario para cursores y avatares. */
export function colorFor(id: string) {
  const palette = ['#b48cff', '#f2a65a', '#4cc38a', '#ff6b8a', '#5ab0ff', '#f2d14a', '#45d0c0', '#ff8f5a'];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
