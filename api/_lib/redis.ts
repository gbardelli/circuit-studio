import { createClient, type RedisClientType } from 'redis';

let pub: RedisClientType | null = null;
let sub: RedisClientType | null = null;
let connecting: Promise<void> | null = null;

/** Un cliente para comandos y publicación, y otro dedicado a suscripciones (Redis lo exige). */
export async function redis() {
  if (!connecting) {
    // Redis Cloud publica REDIS_URL; Upstash (plan gratuito) publica KV_URL (rediss://).
    pub = createClient({ url: process.env.REDIS_URL ?? process.env.KV_URL });
    sub = pub.duplicate();
    pub.on('error', (e) => console.error('redis', e));
    sub.on('error', (e) => console.error('redis sub', e));
    connecting = Promise.all([pub.connect(), sub.connect()]).then(() => undefined);
    connecting.catch(() => (connecting = null));
  }
  await connecting;
  return { pub: pub!, sub: sub! };
}
