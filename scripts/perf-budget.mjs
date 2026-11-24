#!/usr/bin/env node
/**
 * Presupuestos de rendimiento sobre dist/ (después de `vite build`). Si algo se pasa, sale con
 * error y el despliegue no ocurre. Todo en KB comprimidos con gzip, que es lo que viaja.
 *
 * Rutas: lo que descarga el navegador antes de poder usar cada vista (entrada + trozos que
 * index.html precarga para esa URL; ver preloadView en vite.config.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
// Límites justo por encima de lo medido en la 1.0: sirven de trinquete. Si bajas algo, baja su límite.
// 1.0: abrir un circuito 345 · portada 209 · CSS 33 · 3D 186 · guía 4.
const BUDGETS = {
  'Abrir un circuito (JS)': 360,
  'Portada (JS)': 220,
  'CSS inicial': 36,
  'Vista 3D (JS, bajo demanda)': 200,
  'Guía del design system (JS, bajo demanda)': 8,
};

const gz = (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length / 1024;
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const assets = readdirSync(join(DIST, 'assets'));
const entry = html.match(/<script type="module" crossorigin src="\/(assets\/index-[^"]+\.js)"/)?.[1];
const css = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
const lists = html.match(/\?(\[[^\]]*\]):(\[[^\]]*\]);for/);
if (!entry || !lists) {
  console.error('No encuentro la entrada o la precarga de vistas en dist/index.html.');
  process.exit(1);
}
const preloadEntry = [...html.matchAll(/<link rel="modulepreload" crossorigin href="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const initial = [entry, ...preloadEntry];
const sum = (files) => [...new Set(files)].reduce((a, f) => a + gz(f), 0);
const chunk = (prefix) => assets.filter((f) => f.startsWith(prefix) && f.endsWith('.js')).map((f) => `assets/${f}`);

const measured = {
  'Abrir un circuito (JS)': sum([...initial, ...JSON.parse(lists[1])]),
  'Portada (JS)': sum([...initial, ...JSON.parse(lists[2])]),
  'CSS inicial': sum(css),
  'Vista 3D (JS, bajo demanda)': sum(chunk('Board3D-')),
  'Guía del design system (JS, bajo demanda)': sum(chunk('Guide-')),
};

// ngspice (5,7 MB) nunca puede entrar en la carga inicial.
const leaks = [...initial, ...JSON.parse(lists[1]), ...JSON.parse(lists[2])].filter((f) => /eecircuit|spice\.worker/.test(f) || readFileSync(join(DIST, f), 'utf8').includes('ngspice.wasm'));

let failed = leaks.length > 0;
console.log('Presupuesto de rendimiento (KB gzip)\n');
for (const [name, limit] of Object.entries(BUDGETS)) {
  const v = measured[name];
  const ok = v <= limit;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(44)} ${v.toFixed(1).padStart(7)} / ${limit}`);
}
if (leaks.length) console.log(`✗ ngspice en la carga inicial: ${leaks.join(', ')}`);
else console.log('✓ ngspice fuera de la carga inicial');
if (failed) {
  console.error('\nSe pasó un presupuesto. Carga lo nuevo bajo demanda o recorta antes de desplegar.');
  process.exit(1);
}
