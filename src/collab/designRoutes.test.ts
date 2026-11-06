import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { DesignDoc } from './design';

function setup() {
  const doc = new Y.Doc(), design = new DesignDoc(doc.getMap('logic'), fn => doc.transact(fn));
  const a = design.addNode('main', 'in', 0, 0), b = design.addNode('main', 'out', 200, 0);
  const wire = design.addWire('main', { node: a, pin: 'Y' }, { node: b, pin: 'A' }, { points: [{ x: 80, y: 10 }, { x: 80, y: 50 }, { x: 160, y: 50 }, { x: 160, y: 10 }], color: '#53cbb8', label: 'SIGNAL' })!;
  return { doc, design, a, b, wire };
}
describe('persisted logic wire routes', () => {
  it('keeps a route on a click without movement, and reroutes only after its node actually moves', () => {
    const { doc, design, a } = setup();
    design.moveNodes('main', [{ id: a, x: 0, y: 0 }]); expect(design.sheet('main')!.wires[0].points).toHaveLength(4);
    design.moveNodes('main', [{ id: a, x: 20, y: 0 }]);
    expect(design.sheet('main')!.wires[0]).toMatchObject({ color: '#53cbb8', label: 'SIGNAL' });
    expect(design.sheet('main')!.wires[0].points).toBeUndefined(); doc.destroy();
  });
  it('translates the complete route when copying connected nodes', () => {
    const { doc, design } = setup(), sheet = design.sheet('main')!;
    design.paste('main', sheet.nodes, sheet.wires, 50, 70);
    const copied = design.sheet('main')!.wires.find(w => w.id !== sheet.wires[0].id)!;
    expect(copied.points).toEqual(sheet.wires[0].points!.map(p => ({ x: p.x + 50, y: p.y + 70 })));
    expect(copied.color).toBe('#53cbb8'); expect(copied.label).toBe('SIGNAL'); doc.destroy();
  });
  it('drops obsolete bends when rotating an endpoint without changing its net', () => {
    const { doc, design, b, a } = setup(); design.rotateNodes('main', [b]);
    expect(design.sheet('main')!.wires[0]).toMatchObject({ a: { node: a, pin: 'Y' }, b: { node: b, pin: 'A' } });
    expect(design.sheet('main')!.wires[0].points).toBeUndefined(); doc.destroy();
  });
});
