import * as Y from 'yjs';

/** Import only a complete, bounded document. Never reuse the source room or permissions. */
export function importState(value: unknown): { state: string; name: string } {
  if (typeof value !== 'string' || !value || value.length > 4_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Estado de importación inválido o demasiado grande.');
  const doc = new Y.Doc();
  try {
    const bytes = Buffer.from(value, 'base64');
    // Root shared types are inferred on decode. A root sequence must not be reinterpreted
    // as a map, which would otherwise silently hide its array/text contents.
    if (Y.decodeUpdate(bytes).structs.some(item => item instanceof Y.Item && typeof item.parent === 'string' && item.parentSub === null)) throw new Error('Tipo de sección inválido.');
    Y.applyUpdate(doc, bytes);
    const roots = ['parts', 'wires', 'code', 'meta', 'logic'];
    if ([...doc.share.keys()].some(k => !roots.includes(k))) throw new Error('Sección de proyecto desconocida.');
    for (const root of roots) doc.getMap(root).toJSON();
    const name = doc.getMap('meta').get('name');
    if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new Error('Nombre inválido.');
    return { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'), name };
  } finally { doc.destroy(); }
}
