// Antes de desplegar: comprueba que esta versión de la app conoce todos los tipos de pieza que usan los proyectos guardados.
// Si un proyecto usa un tipo que este código no tiene (p. ej. una pieza añadida desde otra copia del repositorio), la app
// lo oculta en silencio: el despliegue lo haría «desaparecer» para todos. Sale con código 1 si hay alguno.
import { loadEnv } from 'vite';
import { neon } from '@neondatabase/serverless';
import * as Y from 'yjs';
import { PARTS } from '../src/parts';
const env = loadEnv('production', process.cwd(), '');
const sql = neon(env.DATABASE_URL);
const rows = await sql`SELECT id, name, state FROM projects WHERE state IS NOT NULL`;
const bad: string[] = [];
for (const r of rows) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(r.state as string, 'base64'));
  const unknown = new Map<string, number>();
  doc.getMap('parts').forEach((p) => {
    const type = String((p as Y.Map<unknown>).get('type'));
    if (!PARTS[type] && !type.startsWith('ic:')) unknown.set(type, (unknown.get(type) ?? 0) + 1);
  });
  if (unknown.size) bad.push(`${r.id} «${r.name}»: ${[...unknown].map(([t, n]) => `${t} ×${n}`).join(', ')}`);
}
if (bad.length) {
  console.error('Esta versión NO conoce piezas que usan estos proyectos; no despliegues:\n' + bad.join('\n'));
  process.exit(1);
}
console.log(`Todos los tipos de pieza de ${rows.length} proyectos existen en esta versión.`);
