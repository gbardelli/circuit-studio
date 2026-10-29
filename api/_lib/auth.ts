// Sesiones de Clerk: el cliente envía su token de sesión (JWT corto) y aquí se verifica.
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Member } from './db.js';

const secretKey = process.env.CLERK_SECRET_KEY ?? '';
const clerk = createClerkClient({ secretKey });
const profiles = new Map<string, { member: Member; at: number }>();

export async function authenticate(token: string | null): Promise<Member | null> {
  if (!token) return null;
  try {
    const payload = await verifyToken(token, { secretKey });
    const id = payload.sub;
    const cached = profiles.get(id);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.member;
    const user = await clerk.users.getUser(id);
    const email = user.primaryEmailAddress?.emailAddress ?? '';
    const member: Member = {
      id,
      name: user.fullName || user.username || email.split('@')[0] || 'Sin nombre',
      image: user.imageUrl ?? null,
    };
    profiles.set(id, { member, at: Date.now() });
    return member;
  } catch {
    return null;
  }
}

export function tokenFrom(req: Request) {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return new URL(req.url).searchParams.get('token');
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function requireUser(req: Request) {
  const user = await authenticate(tokenFrom(req));
  return user ?? null;
}
