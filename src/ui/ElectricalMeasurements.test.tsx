import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ElectricalMeasurements } from './ElectricalMeasurements';
import { useUi } from './store';

const fixture = vi.hoisted(() => ({
  running: true,
  snapshot: { parts: [{ id: 'r', type: 'resistor', x: 0, y: 0, rot: 0, props: { resistance: 100, power: .25 } }], wires: [] },
  engine: { readings: vi.fn(() => ({ 'r:1': 6, 'r:2': 0 })), pinCurrents: vi.fn(() => new Map()) },
}));
vi.mock('./context', () => ({
  useEditor: () => ({ engine: fixture.engine }), useSnapshot: () => fixture.snapshot,
  useSimStatus: () => ({ running: fixture.running }),
}));
let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); fixture.running = true; vi.clearAllMocks(); useUi.getState().select([]); });
describe('electrical measurement panel', () => {
  it('marks excessive power and selects its physical component', () => {
    act(() => { view = create(<ElectricalMeasurements />); });
    expect(view.root.findAllByType('tr').some(r => r.props['data-state'] === 'error')).toBe(true);
    act(() => view.root.findByType('button').props.onClick());
    expect(useUi.getState().selection).toEqual(['r']);
  });
  it('does not display retained readings after simulation stops', () => {
    fixture.running = false;
    act(() => { view = create(<ElectricalMeasurements />); });
    expect(view.root.findAllByType('table')).toHaveLength(0);
    expect(fixture.engine.readings).not.toHaveBeenCalled();
  });
});
