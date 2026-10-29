import { json, requireUser } from '../_lib/auth.js';
import { ready, sql } from '../_lib/db.js';

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Proyectos en los que el usuario es miembro, más recientes primero. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  await ready();
  const rows = await sql`
    SELECT p.id, p.name, p.preview, p.updated_at, p.owner_id, m.role,
      (SELECT count(*) FROM members x WHERE x.project_id = p.id)::int AS members
    FROM members m JOIN projects p ON p.id = m.project_id
    WHERE m.user_id = ${user.id}
    ORDER BY p.updated_at DESC
    LIMIT 200`;
  return json({ projects: rows });
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string };
  const id = body.id && ID_RE.test(body.id) ? body.id : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const name = String(body.name ?? 'Circuito sin título').slice(0, 120);
  await ready();
  await sql`INSERT INTO projects (id, name, owner_id) VALUES (${id}, ${name}, ${user.id})`;
  await sql`INSERT INTO members (project_id, user_id, role, name, image) VALUES (${id}, ${user.id}, 'owner', ${user.name}, ${user.image})`;
  return json({ id, name, role: 'owner' }, 201);
}
