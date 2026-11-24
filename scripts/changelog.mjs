#!/usr/bin/env node
/**
 * Changelog público de CircuitStudio.
 *
 *   node scripts/changelog.mjs build              → public/changelog/{index.html, feed.xml, latest.json}
 *   node scripts/changelog.mjs draft [versión]    → changelog/drafts/<versión>.md: commits desde la última entrada,
 *                                                   agrupados, con el encargo de redacción. Claude la escribe al publicar.
 *   node scripts/changelog.mjs shots <versión>    → capturas de changelog/entries/<versión>.shots.json con Chrome.
 *
 * Las entradas viven en changelog/entries/<versión>.md con un frontmatter mínimo:
 *   version, date (AAAA-MM-DD), title, until (último commit que cubre), summary (una frase).
 * La página no carga JavaScript: HTML y CSS en línea, imágenes diferidas. Los tokens salen de
 * src/design/tokens.css, así que la página comparte paleta y escalas con la app.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES = join(ROOT, 'changelog', 'entries');
const OUT = join(ROOT, 'public', 'changelog');
const SITE = 'https://circuit-studio-eight.vercel.app';

// ── Entradas ─────────────────────────────────────────────────────────────────────
function parseEntry(file) {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: falta el frontmatter`);
  const meta = Object.fromEntries(
    m[1].split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
  );
  for (const k of ['version', 'date', 'title']) if (!meta[k]) throw new Error(`${file}: falta «${k}»`);
  return { ...meta, body: m[2].trim() };
}

const cmpVersion = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  return 0;
};

export function readEntries() {
  if (!existsSync(ENTRIES)) return [];
  return readdirSync(ENTRIES)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseEntry(join(ENTRIES, f)))
    .sort((a, b) => cmpVersion(a.version, b.version));
}

// ── Markdown mínimo (párrafos, ###, listas, imágenes, enlaces, negrita, cursiva, código) ──
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}"${/^https?:/.test(href) ? ' rel="noopener"' : ''}>${t}</a>`);
}

/** Ancho y alto de un JPEG o PNG del disco, para reservar su hueco y evitar saltos al cargar. */
function imageSize(path) {
  const file = join(ROOT, 'public', path.replace(/^\//, ''));
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

export function markdown(md, version) {
  const out = [];
  let list = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    list = null;
  };
  for (const block of md.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const img = block.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (img) {
      flush();
      const [, alt, src, caption] = img;
      const path = src.startsWith('/') ? src : `/changelog/img/${version}/${src}`;
      const size = imageSize(path) ?? { w: 1600, h: 1000 };
      out.push(
        `<figure><img src="${path}" alt="${esc(alt)}" loading="lazy" decoding="async" width="${size.w}" height="${size.h}">${caption ? `<figcaption>${inline(caption)}</figcaption>` : ''}</figure>`,
      );
    } else if (lines.every((l) => /^\s*[-*] /.test(l))) {
      list = [...(list ?? []), ...lines.map((l) => l.replace(/^\s*[-*] /, ''))];
    } else if (/^### /.test(block)) {
      flush();
      out.push(`<h3>${inline(block.slice(4))}</h3>`);
    } else {
      flush();
      out.push(`<p>${inline(lines.join(' '))}</p>`);
    }
  }
  flush();
  return out.join('\n');
}

// ── Página ───────────────────────────────────────────────────────────────────────
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const longDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} de ${MONTHS[m - 1]} de ${y}`;
};

function tokens() {
  const css = readFileSync(join(ROOT, 'src', 'design', 'tokens.css'), 'utf8');
  // Solo primitivos, semánticos y escalas: los alias de migración no hacen falta aquí.
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*--(bg|panel|raised|raised-2|hover|press|line|line-2|ring|text|text-2|text-3|accent-hi|accent-soft|accent-line|green|green-soft|red|red-soft|amber|amber-soft|canvas|grid-dot|r-[a-z]+|sh-[a-z]+|mono|brand|ease|spring|t-[a-z]+|ui-[a-z-]+|lab-[a-z-]+|sch-[a-z-]+):[^;]+;/g, '').replace(/\n{2,}/g, '\n');
}

const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark;-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(1200px 420px at 50% -180px,rgba(80,140,255,.07),transparent 70%),var(--surface-app);color:var(--text-primary);font:var(--fw-regular) var(--fs-lg)/1.6 var(--font);letter-spacing:var(--tracking-md);-webkit-font-smoothing:antialiased}
a{color:var(--accent-hover);text-underline-offset:3px;text-decoration-thickness:1px}
a:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:2px}
.wrap{max-width:720px;margin:0 auto;padding:0 var(--space-5)}
.top{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);padding:var(--space-5) 0}
.brand{display:inline-flex;align-items:center;gap:var(--space-2);color:var(--text-primary);text-decoration:none;font:400 var(--fs-xl) var(--font-brand);letter-spacing:var(--tracking-lg)}
.brand b{font-weight:var(--fw-bold)}
.brand svg{color:var(--live)}
.top nav{display:flex;gap:var(--space-1)}
.top nav a{padding:var(--space-1-5) var(--space-3);border-radius:var(--radius-md);color:var(--text-secondary);text-decoration:none;font-size:var(--fs-md);transition:background var(--dur-fast) var(--ease-standard),color var(--dur-fast) var(--ease-standard)}
@media (hover:hover){.top nav a:hover{background:var(--surface-hover);color:var(--text-primary)}}
.top nav a.cta{background:var(--relief);box-shadow:var(--relief-shadow);color:var(--text-primary)}
header.hero{padding:var(--space-12) 0 var(--space-8)}
header.hero h1{margin:0 0 var(--space-2);font-size:var(--fs-display);line-height:var(--lh-tight);letter-spacing:var(--tracking-display);font-weight:var(--fw-semibold)}
header.hero p{margin:0;color:var(--text-secondary);max-width:52ch}
article{position:relative;display:grid;grid-template-columns:148px minmax(0,1fr);gap:var(--space-6);padding:var(--space-10) 0;border-top:1px solid var(--border-subtle);scroll-margin-top:var(--space-4)}
.meta{position:sticky;top:var(--space-5);align-self:start;display:grid;gap:var(--space-1)}
.ver{justify-self:start;display:inline-flex;align-items:center;height:24px;padding:0 var(--space-2-5,10px);border-radius:var(--radius-full);font-size:var(--fs-sm);font-weight:var(--fw-semibold);font-variant-numeric:tabular-nums;color:var(--text-primary);background:var(--relief);box-shadow:var(--relief-shadow);text-decoration:none}
.ver.beta{color:var(--text-secondary)}
time{font-size:var(--fs-sm);color:var(--text-tertiary)}
.tag{font-size:var(--fs-xs);color:var(--text-tertiary)}
article h2{margin:0 0 var(--space-4);font-size:var(--fs-2xl);line-height:var(--lh-tight);letter-spacing:var(--tracking-xl);font-weight:var(--fw-semibold);text-wrap:balance}
.body p{margin:0 0 var(--space-4);color:#d6d9de;text-wrap:pretty}
.body h3{margin:var(--space-6) 0 var(--space-2);font-size:var(--fs-lg);font-weight:var(--fw-semibold);letter-spacing:var(--tracking-lg)}
.body ul{margin:0 0 var(--space-4);padding-left:var(--space-5);color:#d6d9de}
.body li{margin:var(--space-1) 0}
.body li::marker{color:var(--text-tertiary)}
.body strong{color:var(--text-primary);font-weight:var(--fw-semibold)}
.body code{font:var(--fw-medium) .88em/1 ui-monospace,'SF Mono',Menlo,monospace;padding:2px 5px;border-radius:var(--radius-xs);background:var(--wa-5);color:var(--text-primary)}
figure{margin:var(--space-6) 0;}
figure img{display:block;width:100%;height:auto;border-radius:var(--radius-lg);background:var(--surface-canvas);box-shadow:var(--shadow-stage)}
figcaption{margin-top:var(--space-2);font-size:var(--fs-sm);color:var(--text-tertiary)}
footer{padding:var(--space-10) 0 var(--space-12);border-top:1px solid var(--border-subtle);font-size:var(--fs-sm);color:var(--text-tertiary)}
@media (max-width:640px){
  header.hero{padding:var(--space-8) 0 var(--space-6)}
  header.hero h1{font-size:28px}
  article{grid-template-columns:1fr;gap:var(--space-3);padding:var(--space-8) 0}
  .meta{position:static;display:flex;align-items:center;gap:var(--space-3)}
  .top nav a:not(.cta){display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const LOGO = '<svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true"><path d="M1 13h4V3h4v10h4V3h4v10h4" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

function page(entries) {
  const articles = entries
    .map((e) => {
      const beta = Number(e.version.split('.')[0]) < 1;
      return `<article id="v${esc(e.version)}">
  <div class="meta"><a class="ver${beta ? ' beta' : ''}" href="#v${esc(e.version)}">${esc(e.version)}</a><time datetime="${e.date}">${longDate(e.date)}</time>${beta ? '<span class="tag">Beta</span>' : ''}</div>
  <div><h2>${inline(e.title)}</h2><div class="body">${markdown(e.body, e.version)}</div></div>
</article>`;
    })
    .join('\n');
  const latest = entries[0];
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Novedades · CircuitStudio</title>
<meta name="description" content="Qué ha cambiado en CircuitStudio, versión a versión.">
<link rel="canonical" href="${SITE}/changelog/">
<link rel="alternate" type="application/rss+xml" title="Novedades de CircuitStudio" href="/changelog/feed.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="Novedades · CircuitStudio">
<meta property="og:description" content="${latest ? esc(`${latest.version}: ${latest.title}`) : 'Qué ha cambiado en CircuitStudio.'}">
<meta property="og:image" content="${SITE}/social/circuitstudio-linkedin-v1.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&display=swap" rel="stylesheet">
<style>@font-face{font-family:'Instrument Sans';src:url(/fonts/InstrumentSans-Latin-Variable.woff2) format('woff2');font-weight:400 700;font-display:swap}
${tokens()}${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
<div class="top"><a class="brand" href="/">${LOGO}<span>circuit<b>studio</b></span></a><nav><a href="/changelog/feed.xml">RSS</a><a class="cta" href="/">Abrir la app</a></nav></div>
<header class="hero"><h1>Novedades</h1><p>Lo que ha cambiado en CircuitStudio, contado por quien lo hace. Lo más reciente, arriba.</p></header>
${articles}
<footer>CircuitStudio · <a href="/changelog/feed.xml">Suscríbete por RSS</a></footer>
</div>
</body>
</html>
`;
}

function feed(entries) {
  const items = entries
    .map(
      (e) => `<item><title>${esc(`${e.version} · ${e.title}`)}</title><link>${SITE}/changelog/#v${e.version}</link><guid isPermaLink="false">circuitstudio-${e.version}</guid><pubDate>${new Date(`${e.date}T12:00:00Z`).toUTCString()}</pubDate><description>${esc(markdown(e.body, e.version).replace(/src="\//g, `src="${SITE}/`))}</description></item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Novedades de CircuitStudio</title><link>${SITE}/changelog/</link><description>Qué ha cambiado en CircuitStudio.</description><language>es</language>
${items}
</channel></rss>
`;
}

function build() {
  const entries = readEntries();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'index.html'), page(entries));
  writeFileSync(join(OUT, 'feed.xml'), feed(entries));
  const latest = entries[0];
  writeFileSync(join(OUT, 'latest.json'), JSON.stringify(latest ? { version: latest.version, title: latest.title, date: latest.date } : {}));
  console.log(`changelog: ${entries.length} entradas → public/changelog/`);
}

// ── Borrador desde los commits ────────────────────────────────────────────────────
const TYPES = [
  ['feat', 'Nuevo'],
  ['fix', 'Arreglos'],
  ['perf', 'Rendimiento'],
  ['refactor', 'Por dentro'],
  ['style', 'Aspecto'],
];

function draft(version) {
  const entries = readEntries();
  const since = entries.find((e) => e.until)?.until;
  const range = since ? [`${since}..HEAD`] : ['HEAD'];
  const log = execFileSync('git', ['log', '--no-merges', '--format=%h%x09%ad%x09%s%x09%b%x1e', '--date=short', ...range], { cwd: ROOT, encoding: 'utf8' });
  const commits = log.split('\x1e').map((c) => c.trim()).filter(Boolean).map((c) => {
    const [hash, date, subject, body = ''] = c.split('\t');
    const m = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/);
    return { hash, date, type: m?.[1] ?? 'otros', scope: m?.[2] ?? '', text: m?.[3] ?? subject, body: body.replace(/Co-Authored-By:.*$/gim, '').trim() };
  });
  if (!commits.length) return console.log('No hay commits nuevos desde la última entrada.');
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const v = version ?? '?.?.?';
  const groups = [...TYPES, ['otros', 'Otros']]
    .map(([t, label]) => {
      const list = commits.filter((c) => (t === 'otros' ? !TYPES.some(([k]) => k === c.type) : c.type === t));
      return list.length ? `### ${label}\n${list.map((c) => `- ${c.text}${c.scope ? ` (${c.scope})` : ''} · ${c.hash}${c.body ? `\n  ${c.body.split('\n').join('\n  ')}` : ''}`).join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
  const dir = join(ROOT, 'changelog', 'drafts');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${v}.md`);
  writeFileSync(
    file,
    `# Borrador ${v} · ${commits.length} commits desde ${since ?? 'el principio'}

## Encargo de redacción
Escribe changelog/entries/${v}.md con este frontmatter:

---
version: ${v}
date: ${new Date().toLocaleDateString('sv-SE')}
title: <qué cambia para quien usa la app, en pocas palabras>
until: ${head}
---

Tono: el de quien hace la app hablando con quien la usa. Primera persona, frases cortas y alguna larga,
concreto (números, nombres de piezas, qué se nota). Sin listas de todo: cuenta lo que importa y deja
fuera lo interno. Irregular a propósito: no todas las entradas tienen la misma forma. Nada de
«emocionante», «potente», «mejorado significativamente». Si algo se arregló, di qué fallaba.
Capturas: añade changelog/entries/${v}.shots.json y ejecuta «node scripts/changelog.mjs shots ${v}».

## Commits
${groups}
`,
  );
  console.log(`Borrador: ${file}`);
}

// ── Capturas ───────────────────────────────────────────────────────────────────────
async function shots(version) {
  const spec = join(ENTRIES, `${version}.shots.json`);
  if (!existsSync(spec)) throw new Error(`Falta ${spec}`);
  const list = JSON.parse(readFileSync(spec, 'utf8'));
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error('Instala playwright-core (npm i -D playwright-core). Usa el Chrome del sistema; no descarga navegadores.');
  }
  const browser = await chromium.launch({ channel: 'chrome' });
  const dir = join(OUT, 'img', version);
  mkdirSync(dir, { recursive: true });
  for (const s of list) {
    const page = await browser.newPage({ viewport: { width: s.width ?? 1440, height: s.height ?? 900 }, deviceScaleFactor: s.scale ?? 2, colorScheme: 'dark' });
    await page.goto(new URL(s.url, process.env.CHANGELOG_BASE ?? SITE).toString(), { waitUntil: 'load' });
    for (const step of s.steps ?? []) {
      if (step.click) await page.locator(step.click).first().click();
      if (step.text) await page.getByText(step.text, { exact: true }).first().click();
      if (step.waitFor) await page.locator(step.waitFor).first().waitFor({ timeout: 30_000 });
      if (step.key) await page.keyboard.press(step.key);
      if (step.wheel) {
        const box = page.viewportSize();
        await page.mouse.move(box.width * (step.x ?? 0.45), box.height * (step.y ?? 0.5));
        for (let i = 0; i < (step.times ?? 1); i++) await page.mouse.wheel(0, step.wheel);
      }
      if (step.wait) await page.waitForTimeout(step.wait);
    }
    await page.waitForTimeout(s.settle ?? 800);
    const target = s.selector ? page.locator(s.selector).first() : page;
    const file = join(dir, `${s.name}.jpg`);
    await target.screenshot({ path: file, type: 'jpeg', quality: 78 });
    console.log(`captura: ${file}`);
    await page.close();
  }
  await browser.close();
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'build') build();
else if (cmd === 'draft') draft(arg);
else if (cmd === 'shots') await shots(arg);
else {
  console.log('Uso: node scripts/changelog.mjs build | draft [versión] | shots <versión>');
  process.exitCode = 1;
}
