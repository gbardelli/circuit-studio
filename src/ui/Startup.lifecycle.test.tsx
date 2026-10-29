import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Startup, useStartupTask } from './Startup';

let renderer: ReactTestRenderer | undefined;
let browser: EventTarget;
let reduced = false;
let seen = false;

function Tasks({ session, project }: { session: boolean; project: boolean }) {
  useStartupTask('session', session);
  useStartupTask('project', project);
  return <main>Editor ready</main>;
}
const screen = () => renderer!.root.findAllByProps({ role: 'status' });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  seen = false;
  browser = new EventTarget();
  const storage = { getItem: () => seen ? '1' : null, setItem: () => { seen = true; } };
  const media = new EventTarget();
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('window', Object.assign(browser, {
    sessionStorage: storage,
    setTimeout,
    matchMedia: () => Object.assign(media, { matches: reduced }),
  }));
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('startup lifecycle', () => {
  it('renders the application immediately and removes the first-session introduction', () => {
    act(() => { renderer = create(<Startup cloud={false}><main>Editor ready</main></Startup>); });
    expect(renderer!.root.findByType('main').children).toContain('Editor ready');
    expect(screen()).toHaveLength(1);
    advance(1200);
    expect(screen()[0].props.className).toContain('leaving');
    advance(220);
    expect(screen()).toHaveLength(0);
    expect(seen).toBe(true);
  });

  it.each(['keydown', 'pointerdown'])('lets %s skip the introduction', (event) => {
    act(() => { renderer = create(<Startup cloud={false}><main /></Startup>); });
    act(() => { browser.dispatchEvent(new Event(event)); });
    advance(220);
    expect(screen()).toHaveLength(0);
  });

  it('waits for both session and project data without letting input dismiss actual loading', () => {
    const app = (session: boolean, project: boolean) => <Startup cloud><Tasks session={session} project={project} /></Startup>;
    act(() => { renderer = create(app(true, true)); });
    advance(2000);
    act(() => { browser.dispatchEvent(new Event('keydown')); });
    expect(screen()[0].props.className).not.toContain('leaving');
    act(() => { renderer!.update(app(false, true)); });
    expect(screen()[0].props['aria-label']).toBe('Cargando CircuitStudio');
    act(() => { renderer!.update(app(false, false)); });
    advance(220);
    expect(screen()).toHaveLength(0);
  });

  it.each(['returning', 'reduced motion'])('has no decorative overlay for %s visitors', (mode) => {
    seen = mode === 'returning';
    reduced = mode === 'reduced motion';
    act(() => { renderer = create(<Startup cloud={false}><main /></Startup>); });
    expect(screen()).toHaveLength(0);
  });

  it('clears animation and exit timers when unmounted', () => {
    act(() => { renderer = create(<Startup cloud={false}><main /></Startup>); });
    act(() => renderer!.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
