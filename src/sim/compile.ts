import { sessionToken } from '../cloud';
import { PREBUILT } from './prebuilt';

export interface CompileResult {
  ok: boolean;
  hex?: string;
  stdout: string;
  stderr: string;
  /** No hay compilador disponible: se puede simular, pero sin programa. */
  missingToolchain?: boolean;
}

// Tres niveles antes de ir al servidor, del más rápido al más lento:
// 1. Esta pestaña (memoria), incluidas las compilaciones aún en curso: dos peticiones iguales
//    esperan la misma respuesta.
// 2. Los sketches de las plantillas, compilados al construir la app (`npm run prebuild:hex`).
// 3. Este navegador (localStorage), por el hash del código: al volver no se recompila.
const memory = new Map<string, Promise<CompileResult>>();
const STORE = 'cs-hex:';

export async function sketchKey(source: string, fqbn: string) {
  const data = new TextEncoder().encode(`${fqbn}\n${source}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stored(key: string): CompileResult | null {
  try {
    const hex = localStorage.getItem(STORE + key);
    return hex ? { ok: true, hex, stdout: '', stderr: '' } : null;
  } catch {
    return null;
  }
}

function store(key: string, hex: string) {
  try {
    localStorage.setItem(STORE + key, hex);
  } catch {
    // Lleno: se descartan los programas guardados y se intenta una vez más.
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(STORE)) localStorage.removeItem(k);
      localStorage.setItem(STORE + key, hex);
    } catch {
      /* sin persistencia */
    }
  }
}

export function compileSketch(source: string, fqbn = 'arduino:avr:uno'): Promise<CompileResult> {
  const id = `${fqbn}\n${source}`;
  const hit = memory.get(id);
  if (hit) return hit;
  const job = (async (): Promise<CompileResult> => {
    const key = await sketchKey(source, fqbn);
    const prebuilt = PREBUILT[key];
    if (prebuilt) return { ok: true, hex: prebuilt, stdout: '', stderr: '' };
    const local = stored(key);
    if (local) return local;
    const result = await remote(source, fqbn);
    if (result.ok && result.hex) store(key, result.hex);
    return result;
  })();
  memory.set(id, job);
  // Los fallos no se guardan: el siguiente intento vuelve a preguntar.
  job.then(
    (r) => {
      if (!r.ok) memory.delete(id);
    },
    () => memory.delete(id),
  );
  return job;
}

async function remote(source: string, fqbn: string): Promise<CompileResult> {
  const token = await sessionToken();
  let res: Response;
  try {
    res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ source, fqbn }),
    });
  } catch {
    return { ok: false, stdout: '', stderr: 'No se pudo contactar con el compilador.', missingToolchain: true };
  }
  const result = (await res.json().catch(() => null)) as CompileResult | null;
  if (!result) return { ok: false, stdout: '', stderr: `El compilador respondió ${res.status}.`, missingToolchain: true };
  // Fallo del servicio (no del código): se deja simular con la placa sin programa.
  result.missingToolchain = !result.ok && (res.status >= 500 || res.status === 404 || /no está instalado/.test(result.stderr));
  return result;
}
