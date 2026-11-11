import { describe, expect, it } from 'vitest';
import { fixture } from '../test/electrical';

describe('74LS gate families', () => {
  it.each([
    ['74ls02', 2, false],
    ['74ls10', 3, true],
    ['74ls20', 4, true],
    ['74ls27', 3, false],
  ] as const)('%s follows its gate truth table', (type, count, nand) => {
    const pins = ['1A', '1B', '1C', '1D'].slice(0, count);
    const inputs: Record<string, number> = { VCC: 5 };
    for (const pin of pins) inputs[pin] = 0;
    const circuit = fixture(type, inputs);
    for (let value = 0; value < 2 ** count; value++) {
      const values: Record<string, number> = {};
      pins.forEach((pin, index) => { values[pin] = value & (1 << index) ? 5 : 0; });
      circuit.settle(values);
      const expected = nand ? value !== 2 ** count - 1 : value === 0;
      expect(circuit.volts('1Y') > 2, `${type} input ${value}`).toBe(expected);
    }
  });
});
