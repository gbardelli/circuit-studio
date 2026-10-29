import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Library } from './Library';

let renderer: ReactTestRenderer | undefined;
const cards = () => renderer!.root.findAllByProps({ className: 'card-main' });
const search = (value: string) => act(() => {
  renderer!.root.findByProps({ 'aria-label': 'Buscar componentes' }).props.onChange({ target: { value } });
});

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe('component library interactions', () => {
  it('opens a family, searches globally, then restores the selected family', () => {
    act(() => { renderer = create(<Library />); });
    const categories = renderer!.root.findAllByProps({ className: 'lib-category' });
    expect(categories).toHaveLength(6);
    act(() => categories[4].props.onClick());
    act(() => renderer!.root.findByProps({ 'aria-label': 'Familia de integrados' }).props.onChange({ target: { value: 'Contadores' } }));
    const counters = cards().map((card) => card.props['aria-label']);
    expect(counters.some((label) => label.startsWith('74HC161'))).toBe(true);
    search('arduino uno');
    expect(cards().some((card) => card.props['aria-label'] === 'Arduino Uno R3')).toBe(true);
    expect(renderer!.root.findAllByProps({ 'aria-label': 'Familia de integrados' })).toHaveLength(0);
    search('');
    expect(cards().map((card) => card.props['aria-label'])).toEqual(counters);
  });

  it('shows chip references as text and keeps favorite controls available', () => {
    act(() => { renderer = create(<Library />); });
    search('74hc138');
    expect(cards()[0].props['aria-label']).toContain('74HC138');
    expect(renderer!.root.findAll((node) => typeof node.props.className === 'string' && node.props.className.split(' ').includes('pill'))).toHaveLength(0);
    act(() => renderer!.root.findAllByProps({ 'aria-label': 'Añadir a favoritos' })[0].props.onClick());
    search('');
    expect(cards()[0].props['aria-label']).toContain('74HC138');
    expect(renderer!.root.findAllByProps({ 'aria-label': 'Quitar de favoritos' })).toHaveLength(1);
  });

  it('survives malformed favorite and recent storage without losing navigation', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"unexpected":true}', setItem: vi.fn() });
    act(() => { renderer = create(<Library />); });
    expect(renderer!.root.findAllByProps({ className: 'lib-category' })).toHaveLength(6);
    expect(cards()).toHaveLength(0);
  });
});
