// Salas en funciones de Vercel. Una conexión WebSocket queda fijada a una instancia,
// pero dos personas del mismo circuito pueden caer en instancias distintas, así que:
//   · Redis pub/sub reparte actualizaciones Yjs y de presencia entre instancias,
//   · una lista en Redis guarda las actualizaciones aún no compactadas (nada se pierde
//     si la instancia muere),
//   · Postgres guarda el estado compactado (instantánea) para abrir rápido.
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { redis } from './redis.js';
import type { WebSocket } from 'ws';
import { sql, type Role } from './db.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const COMPACT_AFTER_MS = 4000;
const INSTANCE = crypto.randomUUID();
const REMOTE = { remote: true };

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

interface Conn {
  role: Role;
  ids: Set<number>;
}

export class CloudRoom {
  readonly doc = new Y.Doc({ gc: true });
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly conns = new Map<WebSocket, Conn>();
  private compactTimer: NodeJS.Timeout | null = null;
  private readonly updatesKey: string;
  private readonly docChannel: string;
  private readonly awChannel: string;

  private constructor(readonly name: string) {
    this.updatesKey = `room:${name}:updates`;
    this.docChannel = `room:${name}:doc`;
    this.awChannel = `room:${name}:aw`;
    this.awareness.setLocalState(null);
  }

  static async open(name: string) {
    const room = new CloudRoom(name);
    const { pub, sub } = await redis();
    const [row] = await sql`SELECT state FROM projects WHERE id = ${name}`;
    if (row?.state) Y.applyUpdate(room.doc, unb64(row.state as string), REMOTE);
    for (const u of await pub.lRange(room.updatesKey, 0, -1)) Y.applyUpdate(room.doc, unb64(u), REMOTE);

    await sub.subscribe(room.docChannel, (msg) => {
      const [from, data] = msg.split('|');
      if (from !== INSTANCE) Y.applyUpdate(room.doc, unb64(data), REMOTE);
    });
    await sub.subscribe(room.awChannel, (msg) => {
      const [from, data] = msg.split('|');
      if (from !== INSTANCE) awarenessProtocol.applyAwarenessUpdate(room.awareness, unb64(data), REMOTE);
    });

    room.doc.on('update', (update: Uint8Array, origin: unknown) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      room.broadcast(encoding.toUint8Array(enc), origin as WebSocket);
      if (origin !== REMOTE) {
        const data = b64(update);
        void pub.rPush(room.updatesKey, data);
        void pub.publish(room.docChannel, `${INSTANCE}|${data}`);
        room.scheduleCompact();
      }
    });

    room.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = added.concat(updated, removed);
      const conn = origin && origin !== REMOTE ? room.conns.get(origin as WebSocket) : undefined;
      if (conn) {
        added.forEach((id) => conn.ids.add(id));
        removed.forEach((id) => conn.ids.delete(id));
      }
      const update = awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, update);
      room.broadcast(encoding.toUint8Array(enc), null);
      if (origin !== REMOTE) void pub.publish(room.awChannel, `${INSTANCE}|${b64(update)}`);
    });
    return room;
  }

  private broadcast(message: Uint8Array, except: WebSocket | null) {
    for (const ws of this.conns.keys()) if (ws !== except && ws.readyState === ws.OPEN) ws.send(message);
  }

  private scheduleCompact() {
    if (this.compactTimer) return;
    this.compactTimer = setTimeout(() => {
      this.compactTimer = null;
      void this.compact();
    }, COMPACT_AFTER_MS);
  }

  /**
   * Instantánea en Postgres y recorte de la lista en Redis. Solo se recortan las
   * actualizaciones leídas en este paso: las que llegan mientras tanto se conservan.
   */
  async compact() {
    const { pub } = await redis();
    const pending = await pub.lRange(this.updatesKey, 0, -1);
    for (const u of pending) Y.applyUpdate(this.doc, unb64(u), REMOTE);
    // Otra instancia pudo escribir su instantánea: se fusiona antes de sobrescribir (Yjs es idempotente).
    const [row] = await sql`SELECT state FROM projects WHERE id = ${this.name}`;
    if (row?.state) Y.applyUpdate(this.doc, unb64(row.state as string), REMOTE);
    const state = b64(Y.encodeStateAsUpdate(this.doc));
    await sql`UPDATE projects SET state = ${state}, updated_at = now() WHERE id = ${this.name}`;
    // Se conservan las últimas 50 para quien abra la sala justo durante la compactación.
    if (pending.length > 200) await pub.lTrim(this.updatesKey, pending.length - 50, -1);
  }

  join(ws: WebSocket, role: Role) {
    this.conns.set(ws, { role, ids: new Set() });
    ws.binaryType = 'arraybuffer';
    ws.on('message', (data: ArrayBuffer) => this.onMessage(ws, new Uint8Array(data)));
    ws.on('close', () => void this.leave(ws));
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, this.doc);
    ws.send(encoding.toUint8Array(enc));
    const states = this.awareness.getStates();
    if (states.size) {
      const a = encoding.createEncoder();
      encoding.writeVarUint(a, MSG_AWARENESS);
      encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...states.keys()]));
      ws.send(encoding.toUint8Array(a));
    }
  }

  private onMessage(ws: WebSocket, message: Uint8Array) {
    const conn = this.conns.get(ws);
    if (!conn) return;
    if (message.byteLength > MAX_MESSAGE_BYTES) return ws.close(1009, 'mensaje demasiado grande');
    try {
      const dec = decoding.createDecoder(message);
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC) {
        // Lectores: solo pueden pedir el estado (paso 1), nunca escribir.
        if (conn.role === 'viewer') {
          const peek = decoding.createDecoder(message);
          decoding.readVarUint(peek);
          if (decoding.readVarUint(peek) !== syncProtocol.messageYjsSyncStep1) return;
        }
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(dec, enc, this.doc, ws);
        if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc));
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), ws);
      }
    } catch (err) {
      console.error(`[${this.name}] mensaje inválido`, err);
      ws.close(1003, 'mensaje inválido');
    }
  }

  private async leave(ws: WebSocket) {
    const conn = this.conns.get(ws);
    this.conns.delete(ws);
    if (conn?.ids.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...conn.ids], null);
    if (this.conns.size === 0) {
      if (this.compactTimer) clearTimeout(this.compactTimer);
      this.compactTimer = null;
      await this.compact().catch((e) => console.error('compact', e));
      const { sub } = await redis();
      await sub.unsubscribe(this.docChannel);
      await sub.unsubscribe(this.awChannel);
      rooms.delete(this.name);
      this.doc.destroy();
    }
  }
}

const rooms = new Map<string, Promise<CloudRoom>>();
export function getRoom(name: string) {
  let room = rooms.get(name);
  if (!room) {
    room = CloudRoom.open(name);
    rooms.set(name, room);
    room.catch(() => rooms.delete(name));
  }
  return room;
}
