import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TopBar } from './TopBar';
import { useUi } from './store';

const mocks = vi.hoisted(() => ({ context: {} as Record<string, unknown>, compile: vi.fn(), start: vi.fn(), stop: vi.fn(), program: vi.fn(), clear: vi.fn() }));
vi.mock('../cloud', () => ({ CLOUD: true }));
vi.mock('@clerk/react', () => ({ UserButton: () => null }));
vi.mock('../sim/compile', () => ({ compileSketch: mocks.compile }));
vi.mock('./context', () => ({ useEditor: () => mocks.context, useSnapshot: () => [{ id: 'uno', type: 'arduino-uno' }].reduce((s, p) => ({ ...s, parts: [...s.parts, p] }), { parts: [] as { id: string; type: string }[], wires: [] }), usePeers: () => [], useConnection: () => {}, useSimStatus: () => ({ simTime: 0, speed: 1 }) }));
vi.mock('./Overlays', () => ({ HintButton: (props: Record<string, unknown>) => <button {...props} />, PopoverPanel: ({ trigger }: { trigger: React.ReactNode }) => trigger }));
vi.mock('./History', () => ({ HistoryIcon: () => null, HistoryPanel: () => null }));
vi.mock('./ProjectFiles', () => ({ ProjectFileMenu: () => null }));
vi.mock('./SharePopover', () => ({ SharePopover: () => null }));
let tree: ReactTestRenderer;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('location', { search: '?p=public123&view=1' });
  useUi.setState({ simRunning: false, labPanel: null });
  mocks.context = {
    detail: { guest: true },
    project: { room: 'public123', name: 'Public', synced: true, readOnly: true, connection: 'connected', user: { name: 'Visitante', color: '#888' }, undo: { canUndo: () => false, canRedo: () => false }, sketch: () => ({ toString: () => 'saved sketch' }), snapshot: () => ({ parts: [], wires: [] }), clearSimulationProps: mocks.clear },
    engine: { start: mocks.start, stop: mocks.stop, update: vi.fn(), setProgram: mocks.program },
  };
  mocks.compile.mockResolvedValue({ ok: true, hex: ':00000001FF' });
});
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
const simButton = () => tree.root.findAllByType('button').find(b => String(b.props.className).startsWith('sim-btn'))!;
describe('anonymous simulation controls', () => {
  it('compiles the published board, starts without login and clears local controls when stopped', async () => {
    act(() => { tree = create(<TopBar />); });
    expect(simButton().props.disabled).toBe(false);
    await act(async () => { await simButton().props.onClick(); });
    expect(mocks.compile).toHaveBeenCalledWith('saved sketch', 'arduino:avr:uno', { projectId: 'public123', boardId: 'uno' });
    expect(mocks.program).toHaveBeenCalledWith('uno', ':00000001FF');
    expect(mocks.start).toHaveBeenCalledOnce();
    (mocks.context.project as { synced: boolean }).synced = false;
    act(() => { tree.update(<TopBar />); });
    expect(simButton().props.disabled).toBe(false);
    await act(async () => { await simButton().props.onClick(); });
    expect(mocks.stop).toHaveBeenCalledOnce(); expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it('does not pretend to run firmware when the compiler is unavailable', async () => {
    mocks.compile.mockResolvedValue({ ok: false, missingToolchain: true });
    act(() => { tree = create(<TopBar />); });
    await act(async () => { await simButton().props.onClick(); });
    expect(mocks.start).not.toHaveBeenCalled(); expect(simButton().props.disabled).toBe(false);
  });
});
