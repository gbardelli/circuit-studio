import * as Y from 'yjs';
import { publicViewRole, sql } from './db.js';
import { redis } from './redis.js';
import { DEFAULT_SKETCH } from '../../src/collab/sketch.js';

const BOARDS: Record<string, string> = {
  'arduino-uno': 'arduino:avr:uno',
  'arduino-nano': 'arduino:avr:nano:cpu=atmega328',
  'arduino-mega': 'arduino:avr:mega:cpu=atmega2560',
  'arduino-giga': 'arduino:avr:mega:cpu=atmega2560',
};

/** Anonymous visitors may only compile the exact sketch of a published board. */
export async function isPublishedSketch(projectId: unknown, boardId: unknown, source: string, fqbn: string) {
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(projectId) || typeof boardId !== 'string' || boardId.length > 128) return false;
  if (!(await publicViewRole(projectId))) return false;
  const [row] = await sql`SELECT state FROM projects WHERE id = ${projectId} AND link_access IN ('view', 'edit')`;
  if (!row) return false;
  const { pub } = await redis();
  const updates = await pub.lRange(`room:${projectId}:updates`, 0, -1);
  const doc = new Y.Doc();
  try {
    if (row.state) Y.applyUpdate(doc, Buffer.from(row.state, 'base64'));
    for (const update of updates) Y.applyUpdate(doc, Buffer.from(update, 'base64'));
    const board = doc.getMap<Y.Map<unknown>>('parts').get(boardId);
    if (!board || BOARDS[String(board.get('type'))] !== fqbn) return false;
    return (doc.getMap<Y.Text>('code').get(boardId)?.toString() ?? DEFAULT_SKETCH) === source;
  } finally { doc.destroy(); }
}
