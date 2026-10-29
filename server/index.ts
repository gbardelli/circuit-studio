import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { ROOM_RE, RoomRegistry } from './rooms';
import { compileSketch, compilerAvailable } from './compile';

// CS_PORT y no PORT: algunos lanzadores fijan PORT para el servidor web de Vite.
const PORT = Number(process.env.CS_PORT ?? 1234);
const root = resolve(import.meta.dirname, '..');
const registry = new RoomRegistry(process.env.DATA_DIR ?? join(root, 'data'));
const dist = join(root, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, compiler: compilerAvailable(), rooms: registry.stats() }));
    return;
  }
  if (url.pathname === '/api/compile' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 400_000) {
        res.writeHead(413).end();
        return;
      }
    }
    try {
      const { source, fqbn } = JSON.parse(body) as { source: string; fqbn?: string };
      const result = await compileSketch(String(source ?? ''), fqbn ?? 'arduino:avr:uno');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(400).end();
    }
    return;
  }
  // Producción: sirve el build estático.
  const file = join(dist, url.pathname === '/' ? 'index.html' : url.pathname);
  if (file.startsWith(dist) && existsSync(file) && extname(file)) {
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
    return;
  }
  if (existsSync(join(dist, 'index.html'))) {
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(readFileSync(join(dist, 'index.html')));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const match = url.pathname.match(/^\/ws\/(.+)$/);
  const name = match?.[1];
  if (!name || !ROOM_RE.test(name)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => registry.get(name).join(ws));
});

server.listen(PORT, () => {
  console.log(`Servidor de colaboración en http://localhost:${PORT} (compilador: ${compilerAvailable() ? 'sí' : 'no instalado'})`);
});

const shutdown = () => {
  registry.saveAll();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
