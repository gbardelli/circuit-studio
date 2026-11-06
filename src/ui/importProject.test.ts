import 'fake-indexeddb/auto';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importProjectCopy } from './importProject';
import { parseProjectFile } from '../collab/projectFile';

const cloud = vi.hoisted(() => ({ CLOUD: false, api: vi.fn() }));
vi.mock('../cloud', () => cloud);
const file = () => parseProjectFile(JSON.stringify({ format: 'circuitstudio-project', version: 1, exportedAt: new Date().toISOString(), document: {
  parts: { led: { type: 'led', x: 10.125, y: -33.5, rot: 90, props: { color: 'red' }, z: 3 } }, wires: {}, code: {}, logic: {}, meta: { name: 'Imported', 'assembly.currency': 'PEN' },
} }));
afterEach(() => { cloud.CLOUD = false; cloud.api.mockReset(); });

describe('import as a new project', () => {
  it('waits until the entire local copy is durable before returning its new room', async () => {
    const room = await importProjectCopy(file());
    const doc = new Y.Doc(), persistence = new IndexeddbPersistence(`circuit-studio:${room}`, doc);
    try {
      await persistence.whenSynced;
      expect(doc.getMap('meta').get('name')).toBe('Imported');
      expect(doc.getMap<Y.Map<unknown>>('parts').get('led')?.get('x')).toBe(10.125);
      expect(doc.getMap<Y.Map<unknown>>('parts').get('led')?.get('props')).toBeInstanceOf(Y.Map);
      expect(cloud.api).not.toHaveBeenCalled();
    } finally { await persistence.clearData(); await persistence.destroy(); doc.destroy(); }
  });
  it('creates the cloud project with its full state in one request and no source permissions', async () => {
    cloud.CLOUD = true; cloud.api.mockResolvedValue({ id: 'new-cloud-room' });
    expect(await importProjectCopy(file())).toBe('new-cloud-room');
    const [path, init] = cloud.api.mock.calls[0]; expect(path).toBe('/api/projects');
    const body = JSON.parse(init.body); expect(Object.keys(body)).toEqual(['initialState']);
    const doc = new Y.Doc();
    try { Y.applyUpdate(doc, Buffer.from(body.initialState, 'base64')); expect(doc.getMap('meta').get('name')).toBe('Imported'); }
    finally { doc.destroy(); }
  });
  it('propagates a cloud error without falling back to a different destination', async () => {
    cloud.CLOUD = true; cloud.api.mockRejectedValue(new Error('No connection'));
    await expect(importProjectCopy(file())).rejects.toThrow('No connection'); expect(cloud.api).toHaveBeenCalledTimes(1);
  });
});
