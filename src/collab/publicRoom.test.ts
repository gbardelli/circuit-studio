import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { CloudRoom } from '../../api/_lib/room';

vi.mock('../../api/_lib/db', () => ({ sql: async () => [] }));
vi.mock('../../api/_lib/redis', () => ({ redis: async () => ({ pub: { lRange: async () => [], publish: async () => {}, rPush: async () => {} }, sub: { subscribe: async () => {}, unsubscribe: async () => {} } }) }));
const docs: Y.Doc[] = [];
afterEach(() => { docs.splice(0).forEach(doc => doc.destroy()); });
describe('public collaboration permissions', () => {
  it('serves the circuit state while rejecting viewer writes at the WebSocket boundary', async () => {
    const room = await CloudRoom.open('public123'); docs.push(room.doc);
    room.doc.getMap('meta').set('name', 'Original');
    const socket = Object.assign(new EventEmitter(), { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn(), binaryType: '' });
    room.join(socket as unknown as WebSocket, 'viewer');
    const guest = new Y.Doc(); docs.push(guest);
    guest.getMap('meta').set('name', 'Unauthorized edit');
    guest.getMap('meta').set('unauthorizedProbe', true);
    const write = encoding.createEncoder(); encoding.writeVarUint(write, 0); sync.writeUpdate(write, Y.encodeStateAsUpdate(guest));
    socket.emit('message', encoding.toUint8Array(write));
    expect(room.doc.getMap('meta').get('name')).toBe('Original');
    expect(room.doc.getMap('meta').has('unauthorizedProbe')).toBe(false);
    socket.send.mockClear();
    const read = encoding.createEncoder(); encoding.writeVarUint(read, 0); sync.writeSyncStep1(read, guest);
    socket.emit('message', encoding.toUint8Array(read));
    expect(socket.send).toHaveBeenCalledOnce();
  });
});
