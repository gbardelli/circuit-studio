export interface CompileResult {
  ok: boolean;
  hex?: string;
  stdout: string;
  stderr: string;
  /** El servidor no tiene toolchain: se puede simular, pero sin programa. */
  missingToolchain?: boolean;
}

const cache = new Map<string, CompileResult>();

export async function compileSketch(source: string): Promise<CompileResult> {
  const hit = cache.get(source);
  if (hit) return hit;
  let res: Response;
  try {
    res = await fetch('/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source }) });
  } catch {
    return { ok: false, stdout: '', stderr: 'No se pudo contactar con el servidor de compilación.' };
  }
  if (!res.ok) return { ok: false, stdout: '', stderr: `El servidor respondió ${res.status}.` };
  const result = (await res.json()) as CompileResult;
  result.missingToolchain = !result.ok && /no está instalado/.test(result.stderr);
  if (result.ok) cache.set(source, result);
  return result;
}
