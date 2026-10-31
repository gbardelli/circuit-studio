import { json, requireUser } from '../_lib/auth.js';
import { ready, roleFor, publicViewRole, sql, type LinkAccess } from '../_lib/db.js';

const idOf = (req: Request) => decodeURIComponent(new URL(req.url).pathname.split('/').pop() ?? '');

/** Datos del proyecto y rol del usuario; abrir un enlace compartido lo une como miembro. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  const id = idOf(req);
  if (!user) {
    if (!(await publicViewRole(id))) return json({ error: 'Este enlace no es público. Inicia sesión o pide acceso.' }, 403);
    const [project] = await sql`SELECT id, name, link_access, updated_at FROM projects WHERE id = ${id} AND link_access = 'view'`;
    if (!project) return json({ error: 'Este enlace ya no es público.' }, 403);
    return json({ ...project, owner_id: '', role: 'viewer', guest: true, members: [] });
  }
  const role = await roleFor(id, user);
  if (!role) return json({ error: 'No tienes acceso a este circuito' }, 403);
  const [project] = await sql`SELECT id, name, owner_id, link_access, updated_at FROM projects WHERE id = ${id}`;
  const members = await sql`SELECT user_id AS id, name, image, role FROM members WHERE project_id = ${id} ORDER BY joined_at`;
  return json({ ...project, role: new URL(req.url).searchParams.has('view') ? 'viewer' : role, members });
}

export async function PATCH(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  const id = idOf(req);
  const role = await roleFor(id, user);
  if (role !== 'owner' && role !== 'editor') return json({ error: 'Solo lectura' }, 403);
  const body = (await req.json().catch(() => ({}))) as { name?: string; preview?: unknown; linkAccess?: LinkAccess };
  if (body.linkAccess && role !== 'owner') return json({ error: 'Solo el propietario cambia el acceso' }, 403);
  await ready();
  if (typeof body.name === 'string' && body.name.trim()) await sql`UPDATE projects SET name = ${body.name.trim().slice(0, 120)}, updated_at = now() WHERE id = ${id}`;
  if (body.preview !== undefined) {
    const text = JSON.stringify(body.preview);
    if (text.length < 200_000) await sql`UPDATE projects SET preview = ${text}::jsonb WHERE id = ${id}`;
  }
  if (body.linkAccess && ['none', 'view', 'edit'].includes(body.linkAccess)) {
    if (role !== 'owner') return json({ error: 'Solo el propietario cambia el acceso' }, 403);
    await sql`UPDATE projects SET link_access = ${body.linkAccess} WHERE id = ${id}`;
  }
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  const id = idOf(req);
  await ready();
  const owner = await sql`SELECT 1 FROM members WHERE project_id = ${id} AND user_id = ${user.id} AND role = 'owner'`;
  if (owner.length) {
    await sql`DELETE FROM projects WHERE id = ${id}`;
  } else {
    // Quien no es propietario solo sale del proyecto.
    await sql`DELETE FROM members WHERE project_id = ${id} AND user_id = ${user.id}`;
  }
  return json({ ok: true });
}
