import * as Y from 'yjs';
import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import { api, CLOUD } from '../cloud';
import { projectFileDocument, type ProjectFile } from '../collab/projectFile';

export async function importProjectCopy(file: ProjectFile): Promise<string> {
  const doc = projectFileDocument(file);
  try {
    if (CLOUD) {
      const bytes = Y.encodeStateAsUpdate(doc);
      // Avoid spreading an entire file onto the JS call stack.
      const chunks: string[] = [];
      for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
      const initialState = btoa(chunks.join(''));
      if (initialState.length > 4_000_000) throw new Error('Este proyecto supera el tamaño de importación en la nube.');
      const { id } = await api<{ id: string }>('/api/projects', { method: 'POST', body: JSON.stringify({ initialState }) });
      return id;
    }
    const room = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const persistence = new IndexeddbPersistence(`circuit-studio:${room}`, doc);
    try {
      await persistence.whenSynced;
      await storeState(persistence, true);
      return room;
    } catch (error) {
      await persistence.clearData().catch(() => {});
      throw error;
    } finally { await persistence.destroy(); }
  } finally { doc.destroy(); }
}
