// Postgres (Neon): proyectos, miembros con rol y el estado Yjs compactado de cada circuito.
import { neon } from '@neondatabase/serverless';

export type Role = 'owner' | 'editor' | 'viewer';
export type LinkAccess = 'none' | 'view' | 'edit';

export const sql = neon(process.env.DATABASE_URL ?? '');

let migrated: Promise<void> | null = null;

/** Esquema idempotente: se aplica una vez por instancia. */
export function ready() {
  migrated ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS projects (
      id text PRIMARY KEY,
      name text NOT NULL DEFAULT 'Circuito sin título',
      owner_id text NOT NULL,
      link_access text NOT NULL DEFAULT 'edit',
      preview jsonb,
      state text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS members (
      project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      role text NOT NULL,
      name text,
      image text,
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, user_id)
    )`;
    await sql`CREATE INDEX IF NOT EXISTS members_user_idx ON members (user_id)`;
    // Historial: instantáneas del documento Yjs (automáticas, con nombre y previas a restaurar).
    await sql`CREATE TABLE IF NOT EXISTS project_versions (
      id bigserial PRIMARY KEY,
      project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind text NOT NULL,
      label text,
      author_id text,
      author_name text,
      state text NOT NULL,
      hash text NOT NULL,
      preview jsonb,
      parts int NOT NULL DEFAULT 0,
      wires int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS project_versions_idx ON project_versions (project_id, created_at DESC)`;
  })().catch((err) => {
    migrated = null;
    throw err;
  });
  return migrated;
}

export interface Member {
  id: string;
  name: string;
  image: string | null;
}

/**
 * Rol del usuario en el proyecto. Quien abre un enlace compartido entra como
 * editor o lector según el acceso por enlace, y queda registrado como miembro.
 */
export async function roleFor(projectId: string, user: Member): Promise<Role | null> {
  await ready();
  const existing = await sql`SELECT role FROM members WHERE project_id = ${projectId} AND user_id = ${user.id}`;
  if (existing.length) return existing[0].role as Role;
  const project = await sql`SELECT link_access FROM projects WHERE id = ${projectId}`;
  if (!project.length) return null;
  const access = project[0].link_access as LinkAccess;
  if (access === 'none') return null;
  const role: Role = access === 'edit' ? 'editor' : 'viewer';
  await sql`INSERT INTO members (project_id, user_id, role, name, image)
    VALUES (${projectId}, ${user.id}, ${role}, ${user.name}, ${user.image})
    ON CONFLICT (project_id, user_id) DO NOTHING`;
  return role;
}

/** Anonymous links are explicitly published as view-only; edit links still require an account. */
export async function publicViewRole(projectId: string): Promise<Role | null> {
  await ready();
  const [project] = await sql`SELECT link_access FROM projects WHERE id = ${projectId}`;
  return project?.link_access === 'view' ? 'viewer' : null;
}
