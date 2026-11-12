import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Library } from './Library';
import { ComponentReferences } from './ComponentReferences';
import { useUi } from './store';

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  useUi.setState({ view: 'board', placing: null });
});
afterEach(() => { act(() => renderer?.unmount()); vi.unstubAllGlobals(); });

describe('library documentation', () => {
  it('keeps the component catalog focused on placing parts', () => {
    act(() => { renderer = create(<Library />); });
    act(() => renderer.root.findByProps({ 'aria-label': 'Buscar componentes' }).props.onChange({ target: { value: '74ls48' } }));
    const cards = renderer.root.findAllByProps({ className: 'card-main' });
    expect(cards.length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ className: 'card-docs' }).length).toBeGreaterThan(0);
    act(() => cards[0].props.onClick());
    expect(useUi.getState().placing).toBe('74ls48');
  });
  it('keeps original datasheets available in component references', () => {
    act(() => { renderer = create(<ComponentReferences type="74ls48" />); });
    const link = renderer.root.findByType('a');
    expect(link.props.href).toContain('sn74ls47.pdf');
    expect(link.props.target).toBe('_blank');
  });
});
