import { expect } from 'vitest';
import { Circuit, Resistor, VSource } from '../core/solver';
import { PARTS } from '../parts';

/** Exercise the electrical model, not a duplicate of each chip's logic function. */
export function fixture(type: string, inputs: Record<string, number>, loads: Record<string, number> = {}) {
  const def = PARTS[type];
  const ground = def.ground?.[0] ?? def.reference;
  let count = 0;
  const nodes = new Map(def.pins(def.defaults).map((p) => [p.id, p.id === ground ? -1 : count++]));
  const node = (pin: string) => {
    const n = nodes.get(pin);
    if (n === undefined) throw new Error(`${type}: unknown pin ${pin}`);
    return n;
  };
  const props = { ...def.defaults };
  const model = def.sim!({ props, net: node, node: () => count++, input: () => undefined });
  const elements = [
    ...model.elements,
    ...Object.keys(inputs).map((pin) => new VSource(node(pin), -1, () => inputs[pin], () => 0.01)),
    ...Object.entries(loads).map(([pin, r]) => new Resistor(node(pin), -1, () => r)),
  ];
  const circuit = new Circuit(count, elements);
  const settle = (patch: Record<string, number> = {}) => {
    Object.assign(inputs, patch);
    for (let i = 0; i < 12; i++) {
      expect(circuit.solve(1e-6).converged).toBe(true);
      model.tracker?.sample(circuit.v, 1e-6);
      model.changed?.();
    }
    circuit.solve(1e-6);
  };
  settle();
  return { settle, volts: (pin: string) => node(pin) < 0 ? 0 : circuit.v[node(pin)], props, model, circuit };
}

