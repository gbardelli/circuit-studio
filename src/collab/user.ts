// Identidad local de quien usa la app. Sin Yjs: la portada la usa sin cargar la colaboración.
import { colorFor, sessionUser } from '../cloud';

export interface UserInfo {
  id: string;
  name: string;
  color: string;
  image?: string | null;
}

const NAMES = ['Ada', 'Nikola', 'Hedy', 'Alan', 'Grace', 'Marie', 'Georg', 'Rosalind', 'Claude', 'Lise', 'Emmy', 'André'];
export const PEER_COLORS = ['#b48cff', '#f2a65a', '#4cc38a', '#ff6b8a', '#5ab0ff', '#f2d14a', '#45d0c0', '#ff8f5a'];

export function localUser(): UserInfo {
  const signed = sessionUser();
  if (signed) return { id: signed.id, name: signed.name, image: signed.image, color: colorFor(signed.id) };
  try {
    const saved = localStorage.getItem('cs-user');
    if (saved) return JSON.parse(saved) as UserInfo;
  } catch {
    /* almacenamiento no disponible */
  }
  const user: UserInfo = {
    id: crypto.randomUUID(),
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    color: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)],
  };
  try {
    localStorage.setItem('cs-user', JSON.stringify(user));
  } catch {
    /* sin persistencia */
  }
  return user;
}
