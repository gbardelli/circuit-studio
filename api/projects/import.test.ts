import * as Y from 'yjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './index';

const mocks = vi.hoisted(() => {
  const sql = Object.assign(vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values })), { transaction: vi.fn().mockResolvedValue([]) });
  return { sql, ready: vi.fn(), roleFor: vi.fn(), requireUser: vi.fn() };
});
vi.mock('../_lib/db.js', () => mocks);
vi.mock('../_lib/auth.js', () => ({ requireUser: mocks.requireUser, json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: 'current-user', name: 'Owner', image: null });
});
const request = (body: unknown) => new Request('https://circuit.test/api/projects', { method: 'POST', body: JSON.stringify(body) });
function state() {
  const doc = new Y.Doc(); doc.getMap('meta').set('name', 'Imported circuit');
  const value = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'); doc.destroy(); return value;
}
describe('cloud file import', () => {
  it('atomically creates a private copy owned by the signed-in user', async () => {
    const response = await POST(request({ initialState: state(), name: 'Ignored', owner_id: 'source-owner', link_access: 'edit' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'Imported circuit', role: 'owner' });
    expect(mocks.sql.transaction).toHaveBeenCalledTimes(1);
    const [queries] = mocks.sql.transaction.mock.calls[0] as unknown as [{ text: string; values: unknown[] }[]];
    expect(queries).toHaveLength(2);
    expect(queries[0].text).toContain("'none'");
    expect(queries[0].values).toContain('current-user');
    expect(queries[0].values).not.toContain('source-owner');
    expect(queries[1].text).toContain("'owner'");
  });
  it('does not create anything when authentication or validation fails', async () => {
    expect((await POST(request({ initialState: 'invalid' }))).status).toBe(400);
    mocks.requireUser.mockResolvedValue(null);
    expect((await POST(request({ initialState: state() }))).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled(); expect(mocks.sql.transaction).not.toHaveBeenCalled();
  });
  it('rejects ambiguous import/duplicate requests without changing existing projects', async () => {
    expect((await POST(request({ initialState: state(), duplicateOf: 'original-project' }))).status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
