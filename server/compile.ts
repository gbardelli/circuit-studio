// Compilación de sketches con arduino-cli local (tools/), en un directorio temporal
// por petición, con tiempo máximo y caché por hash del código.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bin = join(root, 'tools', process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
const config = join(root, 'tools', 'arduino-cli.yaml');
const cache = new Map<string, CompileResult>();
const MAX_SOURCE = 200_000;
const TIMEOUT_MS = 60_000;

export interface CompileResult {
  ok: boolean;
  hex?: string;
  stdout: string;
  stderr: string;
}

export function compilerAvailable() {
  return existsSync(bin) && existsSync(config);
}

export async function compileSketch(source: string, board = 'arduino:avr:uno'): Promise<CompileResult> {
  if (source.length > MAX_SOURCE) return { ok: false, stdout: '', stderr: 'El sketch supera el tamaño máximo (200 KB).' };
  if (!compilerAvailable()) {
    return {
      ok: false,
      stdout: '',
      stderr: 'El compilador de Arduino no está instalado en el servidor. Ejecuta "npm run setup:arduino" y reinicia el servidor.',
    };
  }
  const key = createHash('sha256').update(board).update('\0').update(source).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;

  const work = mkdtempSync(join(tmpdir(), 'cs-'));
  const sketchDir = join(work, 'sketch');
  const out = join(work, 'out');
  mkdirSync(sketchDir);
  writeFileSync(join(sketchDir, 'sketch.ino'), source);
  try {
    const result = await new Promise<CompileResult>((done) => {
      execFile(
        bin,
        ['--config-file', config, 'compile', '--fqbn', board, '--output-dir', out, sketchDir],
        { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          const hexFile = join(out, 'sketch.ino.hex');
          if (!err && existsSync(hexFile)) {
            done({ ok: true, hex: readFileSync(hexFile, 'utf8'), stdout, stderr });
          } else {
            done({ ok: false, stdout, stderr: cleanPaths(stderr || String(err), sketchDir) });
          }
        },
      );
    });
    if (result.ok) cache.set(key, result);
    return result;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function cleanPaths(text: string, sketchDir: string) {
  return text.split(sketchDir).join('').replace(/[\\/]sketch\.ino/g, 'sketch.ino');
}
