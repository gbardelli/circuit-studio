import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Startup, useStartupTask } from './Startup';

let renderer: ReactTestRenderer | undefined;

function Tasks({ session, project }: { session: boolean; project: boolean }) {
  useStartupTask('session', session);
  useStartupTask('project', project);
  return <main>Editor ready</main>;
}
const screen = () => renderer!.root.findAllByProps({ role: 'status' });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('startup lifecycle', () => {
  it('renders the application at once and leaves without a decorative wait', () => {
    act(() => { renderer = create(<Startup cloud={false}><main>Editor ready</main></Startup>); });
    expect(renderer!.root.findByType('main').children).toContain('Editor ready');
    // Nada que esperar: la pantalla del documento de arranque se va con su fundido de salida.
    expect(screen()[0].props.className).toContain('leaving');
    advance(220);
    expect(screen()).toHaveLength(0);
  });

  it('stays exactly as long as session and project data take, and input cannot dismiss it', () => {
    const app = (session: boolean, project: boolean) => <Startup cloud><Tasks session={session} project={project} /></Startup>;
    act(() => { renderer = create(app(true, true)); });
    advance(2000);
    act(() => { window.dispatchEvent(new Event('keydown')); });
    expect(screen()[0].props.className).not.toContain('leaving');
    act(() => { renderer!.update(app(false, true)); });
    expect(screen()[0].props['aria-label']).toBe('Cargando CircuitStudio');
    act(() => { renderer!.update(app(false, false)); });
    expect(screen()[0].props.className).toContain('leaving');
    advance(220);
    expect(screen()).toHaveLength(0);
  });

  it('comes back if a new task starts while it is leaving', () => {
    const app = (project: boolean) => <Startup cloud={false}><Tasks session={false} project={project} /></Startup>;
    act(() => { renderer = create(app(false)); });
    act(() => { renderer!.update(app(true)); });
    advance(400);
    expect(screen()).toHaveLength(1);
    expect(screen()[0].props.className).not.toContain('leaving');
  });

  it('clears its exit timer when unmounted', () => {
    act(() => { renderer = create(<Startup cloud={false}><main /></Startup>); });
    act(() => renderer!.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
