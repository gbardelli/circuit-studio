// Prueba de humo de la infraestructura en la nube con las credenciales reales (.env.local):
// Postgres (esquema y roles), Redis (registro y pub/sub), sala con compactación y,
// con --compile, compilación en Vercel Sandbox. Limpia lo que crea.
// Uso: npx tsx --env-file=.env.local scripts/smoke-cloud.ts [--compile]
import * as Y from 'yjs';
import { ready, roleFor, sql } from '../api/_lib/db.js';
import { redis } from '../api/_lib/redis.js';
import { getRoom } from '../api/_lib/room.js';

const ROOM = `smoke${Date.now().toString(36)}`;
const owner = { id: 'smoke-owner', name: 'Prueba', image: null };
const guest = { id: 'smoke-guest', name: 'Invitado', image: null };
const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FALLO'} ${label}`);
  if (!cond) process.exitCode = 1;
};

async function main() {
  await ready();
  ok('esquema de Postgres', true);
  await sql`INSERT INTO projects (id, name, owner_id) VALUES (${ROOM}, 'Prueba de humo', ${owner.id})`;
  await sql`INSERT INTO members (project_id, user_id, role, name) VALUES (${ROOM}, ${owner.id}, 'owner', ${owner.name})`;
  ok('rol del propietario', (await roleFor(ROOM, owner)) === 'owner');
  ok('enlace con edición → editor', (await roleFor(ROOM, guest)) === 'editor');
  await sql`UPDATE projects SET link_access = 'none' WHERE id = ${ROOM}`;
  ok('miembro conserva su rol con acceso restringido', (await roleFor(ROOM, guest)) === 'editor');
  ok('desconocido sin acceso', (await roleFor(ROOM, { id: 'smoke-x', name: 'X', image: null })) === null);

  const { pub } = await redis();
  ok('Redis responde', (await pub.ping()) === 'PONG');

  const room = await getRoom(ROOM);
  room.doc.transact(() => room.doc.getMap('parts').set('p1', 'led'), { local: true });
  await new Promise((r) => setTimeout(r, 300));
  ok('actualización en el registro de Redis', (await pub.lLen(`room:${ROOM}:updates`)) >= 1);
  await room.compact();
  const [row] = await sql`SELECT state FROM projects WHERE id = ${ROOM}`;
  const copy = new Y.Doc();
  Y.applyUpdate(copy, new Uint8Array(Buffer.from(row.state as string, 'base64')));
  ok('instantánea en Postgres reconstruye el circuito', copy.getMap('parts').get('p1') === 'led');

  if (process.argv.includes('--compile')) {
    const { compileInSandbox } = await import('../api/compile.js');
    const started = Date.now();
    const r = await compileInSandbox('void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);delay(500);digitalWrite(13,LOW);delay(500);}');
    ok(`compilación en Sandbox (${Math.round((Date.now() - started) / 1000)} s)`, r.ok && (r.hex?.startsWith(':') ?? false));
    if (!r.ok) console.log(r.stderr.slice(-600));
  }

  await sql`DELETE FROM projects WHERE id = ${ROOM}`;
  await pub.del(`room:${ROOM}:updates`);
  process.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
