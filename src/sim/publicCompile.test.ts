import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/compile';

const mocks = vi.hoisted(() => ({ user: vi.fn(), published: vi.fn(), get: vi.fn(), incr: vi.fn(), expire: vi.fn() }));
vi.mock('../../api/_lib/auth', () => ({ requireUser: mocks.user, json: (data: unknown, status = 200) => Response.json(data, { status }) }));
vi.mock('../../api/_lib/publishedSketch', () => ({ isPublishedSketch: mocks.published }));
vi.mock('../../api/_lib/redis', () => ({ redis: async () => ({ pub: { get: mocks.get, incr: mocks.incr, expire: mocks.expire } }) }));
const request = () => new Request('https://example.com/api/compile', { method: 'POST', body: JSON.stringify({ source: 'saved sketch', fqbn: 'arduino:avr:uno', projectId: 'public123', boardId: 'uno' }) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(null); mocks.published.mockResolvedValue(true); mocks.get.mockResolvedValue(JSON.stringify({ ok: true, hex: ':00000001FF', stdout: '', stderr: '' })); });
describe('anonymous compilation endpoint', () => {
  it('serves an existing compiled program only after checking public project access', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).hex).toBe(':00000001FF');
    expect(mocks.published).toHaveBeenCalledWith('public123', 'uno', 'saved sketch', 'arduino:avr:uno');
  });
  it('does not disclose cached programs for private or altered project code', async () => {
    mocks.published.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('rate limits new anonymous compilations for each public project', async () => {
    mocks.get.mockResolvedValue(null); mocks.incr.mockResolvedValue(21);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.incr.mock.calls[0][0]).toContain('public:public123');
  });
});
