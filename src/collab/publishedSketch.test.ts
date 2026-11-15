import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { isPublishedSketch } from '../../api/_lib/publishedSketch';

const mocks = vi.hoisted(() => ({ role: vi.fn(), sql: vi.fn(), updates: vi.fn() }));
vi.mock('../../api/_lib/db', () => ({ publicViewRole: mocks.role, sql: mocks.sql }));
vi.mock('../../api/_lib/redis', () => ({ redis: async () => ({ pub: { lRange: mocks.updates } }) }));
const source = 'void setup() {}\nvoid loop() {}';
const fqbn = 'arduino:avr:mega:cpu=atmega2560';
let state: string;
beforeEach(() => {
  vi.clearAllMocks();
  const doc = new Y.Doc();
  const part = new Y.Map(); part.set('type', 'arduino-giga');
  doc.getMap('parts').set('giga', part);
  doc.getMap('code').set('giga', new Y.Text(source));
  state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'); doc.destroy();
  mocks.role.mockResolvedValue('viewer');
  mocks.sql.mockImplementation(async () => [{ state }]);
  mocks.updates.mockResolvedValue([]);
});
describe('published board compilation', () => {
  it('allows the exact saved sketch and board configuration of a public project', async () => {
    expect(await isPublishedSketch('public123', 'giga', source, fqbn)).toBe(true);
  });
  it('denies private projects before reading their code', async () => {
    mocks.role.mockResolvedValue(null);
    expect(await isPublishedSketch('private123', 'giga', source, fqbn)).toBe(false);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects arbitrary code, missing boards and substituted board targets', async () => {
    expect(await isPublishedSketch('public123', 'giga', 'unpublished code', fqbn)).toBe(false);
    expect(await isPublishedSketch('public123', 'missing', source, fqbn)).toBe(false);
    expect(await isPublishedSketch('public123', 'giga', source, 'arduino:avr:uno')).toBe(false);
    expect(await isPublishedSketch(undefined, undefined, source, fqbn)).toBe(false);
  });
  it('uses pending collaborative changes instead of compiling stale saved code', async () => {
    const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state, 'base64'));
    const vector = Y.encodeStateVector(doc);
    doc.getMap<Y.Text>('code').get('giga')!.insert(0, '// latest\n');
    mocks.updates.mockResolvedValue([Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64')]);
    expect(await isPublishedSketch('public123', 'giga', '// latest\n' + source, fqbn)).toBe(true);
    expect(await isPublishedSketch('public123', 'giga', source, fqbn)).toBe(false);
    doc.destroy();
  });
});
