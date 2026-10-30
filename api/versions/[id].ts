// Historial de un circuito: listar versiones, leer una y guardar una nueva.
// El estado es el documento Yjs entero (base64); restaurar lo hace el cliente sobre el documento
// compartido, así el cambio llega a todos los conectados y se puede deshacer.
import { createHash } from 'node:crypto';
import { json, requireUser } from '../_lib/auth.js';
import { ready, roleFor, sql } from '../_lib/db.js';

const idOf = (req: Request) => decodeURIComponent(new URL(req.url).pathname.split('/').pop() ?? '');
const MAX_STATE = 3_000_000;
const AUTO_EVERY_MS = 10 * 60_000;
const KEEP_AUTO = 60;

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  const id = idOf(req);
  if (!(await roleFor(id, user))) return json({ error: 'No tienes acceso a este circuito' }, 403);
  const v = new URL(req.url).searchParams.get('v');
  if (v) {
    const [row] = await sql`SELECT id, state, preview FROM project_versions WHERE project_id = ${id} AND id = ${v}`;
    return row ? json(row) : json({ error: 'Esa versión no existe' }, 404);
  }
  const versions = await sql`
    SELECT id, kind, label, author_name, parts, wires, created_at
    FROM project_versions WHERE project_id = ${id}
    ORDER BY created_at DESC LIMIT 200`;
  return json({ versions });
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  const id = idOf(req);
  const role = await roleFor(id, user);
  if (role !== 'owner' && role !== 'editor') return json({ error: 'Solo lectura' }, 403);
  const body = (await req.json().catch(() => ({}))) as { state?: string; preview?: unknown; label?: string; kind?: string; parts?: number; wires?: number };
  const state = String(body.state ?? '');
  if (!state || state.length > MAX_STATE) return json({ error: 'Versión vacía o demasiado grande' }, 400);
  const kind = body.kind === 'manual' || body.kind === 'restore' ? body.kind : 'auto';
  const hash = createHash('sha256').update(state).digest('hex');
  await ready();
  const [last] = await sql`SELECT hash, created_at FROM project_versions WHERE project_id = ${id} ORDER BY created_at DESC LIMIT 1`;
  // Las automáticas: como mucho una cada 10 minutos y solo si algo cambió.
  if (kind === 'auto' && last && (last.hash === hash || Date.now() - Date.parse(last.created_at) < AUTO_EVERY_MS)) return json({ skipped: true });
  const preview = body.preview === undefined ? null : JSON.stringify(body.preview);
  const [row] = await sql`
    INSERT INTO project_versions (project_id, kind, label, author_id, author_name, state, hash, preview, parts, wires)
    VALUES (${id}, ${kind}, ${body.label?.trim().slice(0, 80) || null}, ${user.id}, ${user.name}, ${state}, ${hash},
            ${preview}::jsonb, ${Number(body.parts) || 0}, ${Number(body.wires) || 0})
    RETURNING id, created_at`;
  // Se conservan todas las versiones con nombre; de las automáticas, las últimas KEEP_AUTO.
  await sql`DELETE FROM project_versions WHERE project_id = ${id} AND kind = 'auto' AND id NOT IN (
    SELECT id FROM project_versions WHERE project_id = ${id} AND kind = 'auto' ORDER BY created_at DESC LIMIT ${KEEP_AUTO})`;
  return json(row, 201);
}
