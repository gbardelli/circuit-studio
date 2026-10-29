import { sessionToken } from '../cloud';

export interface CompileResult {
  ok: boolean;
  hex?: string;
  stdout: string;
  stderr: string;
  /** No hay compilador disponible: se puede simular, pero sin programa. */
  missingToolchain?: boolean;
}

const cache = new Map<string, CompileResult>();

export async function compileSketch(source: string, fqbn = 'arduino:avr:uno'): Promise<CompileResult> {
  const key = `${fqbn}\n${source}`;
  const hit = cache.get(key);
  if (hit) return hit;
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
  if (result.ok) cache.set(key, result);
  return result;
}
