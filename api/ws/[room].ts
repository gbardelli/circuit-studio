// WebSocket de colaboración: /api/ws/<proyecto>?token=<sesión de Clerk>.
// Protocolo y-websocket; se verifica la sesión y el rol antes de aceptar la conexión.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { authenticate } from '../_lib/auth.js';
import { roleFor } from '../_lib/db.js';
import { getRoom } from '../_lib/room.js';

const ROOM_RE = /^[A-Za-z0-9_-]{8,64}$/;
const server = http.createServer((_req, res) => {
  res.writeHead(426, { 'content-type': 'text/plain' }).end('Usa WebSocket');
});
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  const reject = (code: number, text: string) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\n\r\n`);
    socket.destroy();
  };
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const name = url.searchParams.get('room') ?? decodeURIComponent(url.pathname.split('/').pop() ?? '');
    if (!ROOM_RE.test(name)) return reject(400, 'Bad Request');
    const user = await authenticate(url.searchParams.get('token'));
    if (!user) return reject(401, 'Unauthorized');
    const role = await roleFor(name, user);
    if (!role) return reject(403, 'Forbidden');
    const room = await getRoom(name);
    wss.handleUpgrade(req, socket, head, (ws) => room.join(ws, role));
  } catch (err) {
    console.error('ws upgrade', err);
    reject(500, 'Internal Server Error');
  }
});

export default server;
