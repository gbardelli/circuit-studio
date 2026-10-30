// Compila los sketches de las plantillas con el arduino-cli local (`npm run setup:arduino`) y
// guarda los .hex en src/sim/prebuilt.ts: al abrir una plantilla, Simular no espera al servidor.
// Ejecútalo tras cambiar el sketch de una plantilla: `npm run prebuild:hex`.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { compileSketch } from '../server/compile';
import { TEMPLATES } from '../src/collab/templates';
import { PARTS } from '../src/parts';

const out: Record<string, string> = {};
for (const t of TEMPLATES) {
  if (!t.sketch) continue;
  const mcu = t.parts.find((p) => PARTS[p.type].mcu);
  if (!mcu) continue;
  const fqbn = PARTS[mcu.type].mcu!.fqbn;
  const r = await compileSketch(t.sketch, fqbn);
  if (!r.ok || !r.hex) throw new Error(`${t.id}: ${r.stderr}`);
  const key = createHash('sha256').update(`${fqbn}\n${t.sketch}`).digest('hex');
  out[key] = r.hex;
  console.log(`${t.id.padEnd(18)} ${fqbn.padEnd(32)} ${(r.hex.length / 1024).toFixed(1)} KB`);
}
const body = Object.entries(out)
  .map(([k, hex]) => `  '${k}':\n    ${JSON.stringify(hex)},`)
  .join('\n');
writeFileSync(
  'src/sim/prebuilt.ts',
  `// Generado por scripts/prebuild-hex.ts: .hex de los sketches de las plantillas, por SHA-256 de\n// la placa y la fuente. No lo edites a mano; vuelve a generarlo si cambias un sketch.\nexport const PREBUILT: Record<string, string> = {\n${body}\n};\n`,
);
