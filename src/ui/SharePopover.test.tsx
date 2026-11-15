import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SharePopover, projectLink } from './SharePopover';
import { EditorContext } from './context';
import type { Project } from '../collab/project';
import type { SimClient } from '../sim/client';
import type { ProjectDetail } from '../cloud';

const mocks = vi.hoisted(() => ({ api: vi.fn(), copy: vi.fn() }));
vi.mock('../cloud', () => ({ api: mocks.api }));
let tree: ReactTestRenderer;
let detail: ProjectDetail;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { href: 'https://circuit-studio-eight.vercel.app/?p=public123&template=old&share=1#fragment' });
  vi.stubGlobal('navigator', { clipboard: { writeText: mocks.copy } });
  detail = { id: 'public123', name: 'Circuit', owner_id: 'owner', role: 'owner', link_access: 'view', members: [] };
  mocks.api.mockImplementation(async (_path, init) => init?.method === 'PATCH' ? { ok: true } : detail);
  mocks.copy.mockResolvedValue(undefined);
});
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => { tree = create(<EditorContext.Provider value={{ project: { room: 'public123' } as Project, engine: {} as SimClient, detail }}><SharePopover /></EditorContext.Provider>); });
}
const copy = () => tree.root.findByType('button');
describe('sharing controls', () => {
  it('copies a clean anonymous viewing link without mutating permissions', async () => {
    await mount();
    await act(async () => { await copy().props.onClick(); });
    expect(mocks.copy).toHaveBeenCalledWith('https://circuit-studio-eight.vercel.app/?p=public123&view=1');
    expect(mocks.api.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    expect(copy().children).toContain('Enlace copiado');
  });
  it('copies editing links without silently downgrading editors', async () => {
    detail.link_access = 'edit'; await mount();
    await act(async () => { await copy().props.onClick(); });
    expect(mocks.copy).toHaveBeenCalledWith('https://circuit-studio-eight.vercel.app/?p=public123');
    expect(mocks.api.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    expect(projectLink('public123', 'edit', true)).toBe('https://circuit-studio-eight.vercel.app/?p=public123&view=1');
  });
  it('only changes permissions when the owner explicitly changes the selector', async () => {
    detail.link_access = 'none'; await mount();
    await act(async () => { await tree.root.findByType('select').props.onChange({ target: { value: 'view' } }); });
    expect(mocks.api).toHaveBeenLastCalledWith('/api/projects/public123', { method: 'PATCH', body: JSON.stringify({ linkAccess: 'view' }) });
    expect(tree.root.findByType('select').props.value).toBe('view');
  });
  it('preserves the previous permission if saving fails', async () => {
    await mount(); mocks.api.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await tree.root.findByType('select').props.onChange({ target: { value: 'edit' } }); });
    expect(tree.root.findByType('select').props.value).toBe('view');
    expect(tree.root.findByProps({ role: 'alert' }).children.join('')).toContain('Se mantiene el acceso anterior');
  });
  it('lets existing viewers copy a link but prevents permission changes', async () => {
    detail.role = 'viewer'; await mount();
    expect(tree.root.findByType('select').props.disabled).toBe(true);
    expect(copy().props.disabled).toBe(false);
  });
});
