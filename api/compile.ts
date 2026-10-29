// Compilación de sketches en Vercel Sandbox (microVM aislada).
// · Una sandbox base con nombre guarda arduino-cli y el core AVR instalados (se prepara una vez).
// · Cada compilación corre en un clon desechable de la base: el código del usuario nunca
//   toca la base ni las funciones.
// · Los .hex se guardan en Redis por hash del código: recompilar lo mismo es instantáneo.
import { createHash } from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { json, requireUser } from './_lib/auth.js';
import { redis } from './_lib/redis.js';

export const maxDuration = 300;

const BASE = 'cs-arduino-toolchain-v1';
const HOME = '/vercel/sandbox/cs';
const ENV = `export ARDUINO_DIRECTORIES_DATA=${HOME}/data ARDUINO_DIRECTORIES_USER=${HOME}/user ARDUINO_DIRECTORIES_DOWNLOADS=${HOME}/dl;`;
const SETUP = `set -e; mkdir -p ${HOME} && cd ${HOME}; ${ENV}
curl -fsSL https://github.com/arduino/arduino-cli/releases/download/v1.5.1/arduino-cli_1.5.1_Linux_64bit.tar.gz | tar xz
./arduino-cli core update-index
./arduino-cli core install arduino:avr
./arduino-cli lib install Servo
rm -rf ${HOME}/dl && touch ${HOME}/.ready`;
const MAX_SOURCE = 200_000;

async function ensureBase() {
  let base: Sandbox;
  try {
    base = await Sandbox.get({ name: BASE });
  } catch {
    base = await Sandbox.create({ name: BASE, runtime: 'node24', persistent: true, timeout: 15 * 60_000 });
  }
  const ready = await base.runCommand('test', ['-f', `${HOME}/.ready`]);
  if (ready.exitCode === 0) return;
  const { pub } = await redis();
  // Un único preparador a la vez; el resto espera a que exista la marca.
  if (await pub.set('compile:setup-lock', '1', { NX: true, EX: 600 })) {
    const setup = await base.runCommand('bash', ['-lc', SETUP]);
    if (setup.exitCode !== 0) {
      await pub.del('compile:setup-lock');
      throw new Error(`No se pudo preparar el compilador: ${(await setup.stderr()).slice(-400)}`);
    }
    await base.stop(); // guarda la instantánea que heredarán los clones
    await pub.del('compile:setup-lock');
    return;
  }
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    if (!(await pub.exists('compile:setup-lock'))) return;
  }
  throw new Error('El compilador se está preparando. Inténtalo en un minuto.');
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ ok: false, stdout: '', stderr: 'Inicia sesión para compilar.' }, 401);
  const { source } = (await req.json().catch(() => ({}))) as { source?: string };
  const code = String(source ?? '');
  if (code.length > MAX_SOURCE) return json({ ok: false, stdout: '', stderr: 'El sketch supera 200 KB.' }, 413);

  const { pub } = await redis();
  const key = `hex:${createHash('sha256').update(code).digest('hex')}`;
  const cached = await pub.get(key);
  if (cached) return json(JSON.parse(cached));

  // 20 compilaciones por minuto y usuario.
  const rate = `compile:rate:${user.id}:${Math.floor(Date.now() / 60_000)}`;
  if ((await pub.incr(rate)) > 20) return json({ ok: false, stdout: '', stderr: 'Demasiadas compilaciones seguidas. Espera un minuto.' }, 429);
  await pub.expire(rate, 120);

  try {
    const result = await compileInSandbox(code);
    if (result.ok) await pub.set(key, JSON.stringify(result), { EX: 7 * 24 * 3600 });
    return json(result);
  } catch (err) {
    console.error('compile', err);
    return json({ ok: false, stdout: '', stderr: (err as Error).message || 'Error del compilador' }, 500);
  }
}

/** Compila en un clon desechable de la sandbox base. */
export async function compileInSandbox(code: string) {
  await ensureBase();
  const box = await Sandbox.fork({ sourceSandbox: BASE, persistent: false, timeout: 3 * 60_000 });
  try {
    await box.writeFiles([{ path: `${HOME}/sketch/sketch.ino`, content: code }]);
    const run = await box.runCommand('bash', ['-lc', `cd ${HOME}; ${ENV} ./arduino-cli compile --fqbn arduino:avr:uno --output-dir ${HOME}/out ${HOME}/sketch`]);
    const stdout = await run.stdout();
    const stderr = (await run.stderr()).split(`${HOME}/sketch/`).join('');
    if (run.exitCode !== 0) return { ok: false, stdout, stderr };
    const hex = await box.readFileToBuffer({ path: `${HOME}/out/sketch.ino.hex` });
    if (!hex) return { ok: false, stdout, stderr: 'El compilador no generó el .hex.' };
    return { ok: true, hex: hex.toString('utf8'), stdout, stderr };
  } finally {
    await box.delete().catch(() => {});
  }
}
