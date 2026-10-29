// Salas de colaboración: un Y.Doc autoritativo por proyecto, protocolo y-websocket
// (sync + awareness), persistencia en disco con escritura atómica y copia previa.
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WebSocket } from 'ws';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const SAVE_DEBOUNCE_MS = 800;

export const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class Room {
  readonly doc = new Y.Doc({ gc: true });
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly conns = new Map<WebSocket, Set<number>>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(readonly name: string, private readonly dir: string) {
    this.awareness.setLocalState(null);
    const file = this.file();
    if (existsSync(file)) {
      Y.applyUpdate(this.doc, readFileSync(file));
    }
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.broadcast(encoding.toUint8Array(enc), origin as WebSocket | null);
      this.scheduleSave();
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = added.concat(updated, removed);
      const ids = origin ? this.conns.get(origin as WebSocket) : undefined;
      if (ids) {
        added.forEach((id) => ids.add(id));
        removed.forEach((id) => ids.delete(id));
      }
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      this.broadcast(encoding.toUint8Array(enc), null);
    });
  }

  private file() {
    return join(this.dir, `${this.name}.ydoc`);
  }

  private broadcast(message: Uint8Array, except: WebSocket | null) {
    for (const ws of this.conns.keys()) {
      if (ws !== except && ws.readyState === ws.OPEN) ws.send(message);
    }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_DEBOUNCE_MS);
  }

  save() {
    mkdirSync(this.dir, { recursive: true });
    const file = this.file();
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, Y.encodeStateAsUpdate(this.doc));
    if (existsSync(file)) copyFileSync(file, `${file}.bak`);
    renameSync(tmp, file);
  }

  join(ws: WebSocket) {
    this.conns.set(ws, new Set());
    ws.binaryType = 'arraybuffer';
    ws.on('message', (data: ArrayBuffer) => this.onMessage(ws, new Uint8Array(data)));
    ws.on('close', () => this.leave(ws));

    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, this.doc);
    ws.send(encoding.toUint8Array(enc));

    const states = this.awareness.getStates();
    if (states.size > 0) {
      const aenc = encoding.createEncoder();
      encoding.writeVarUint(aenc, MSG_AWARENESS);
      encoding.writeVarUint8Array(aenc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...states.keys()]));
      ws.send(encoding.toUint8Array(aenc));
    }
  }

  private onMessage(ws: WebSocket, message: Uint8Array) {
    if (message.byteLength > MAX_MESSAGE_BYTES) {
      ws.close(1009, 'mensaje demasiado grande');
      return;
    }
    try {
      const dec = decoding.createDecoder(message);
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC) {
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

  private leave(ws: WebSocket) {
    const ids = this.conns.get(ws);
    this.conns.delete(ws);
    if (ids && ids.size > 0) awarenessProtocol.removeAwarenessStates(this.awareness, [...ids], null);
    if (this.conns.size === 0) this.save();
  }
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  constructor(private readonly dir: string) {}

  get(name: string) {
    let room = this.rooms.get(name);
    if (!room) {
      room = new Room(name, this.dir);
      this.rooms.set(name, room);
    }
    return room;
  }

  saveAll() {
    for (const room of this.rooms.values()) room.save();
  }

  stats() {
    return [...this.rooms.values()].map((r) => ({ room: r.name, connections: r.conns.size }));
  }
}
