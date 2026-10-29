import { describe, expect, it } from 'vitest';
import { PARTS } from './index';
import { fixture } from '../test/electrical';

describe('course diagram packages', () => {
  it.each(['pcf8574', 'pcf8574a'])('%s powers up with released ports and no spurious input interrupt', (type) => {
    const h = fixture(type, { VCC: 5, A0: 0, A1: 0, A2: 0 });
    for (let i = 0; i < 8; i++) expect(h.volts(`P${i}`)).toBeGreaterThan(4.5);
    expect(h.model.tracker!.read().interrupt).toBe(false);
    h.model.i2c!.write(0, h.circuit.v); h.settle();
    for (let i = 0; i < 8; i++) expect(h.volts(`P${i}`)).toBeLessThan(.1);
    h.settle({ VCC: 0 }); h.settle({ VCC: 5 });
    expect(h.model.tracker!.read().value).toBe(255);
    for (let i = 0; i < 8; i++) expect(h.volts(`P${i}`)).toBeGreaterThan(4.5);
  });
  it.each([
    ['7473', ['1CLK','1CLR','1K','VCC','2CLK','2CLR','2J','2QN','2Q','2K','GND','1QN','1Q','1J']],
    ['7475', ['1QN','1D','2D','LE34','VCC','3D','4D','4QN','4Q','3Q','3QN','GND','LE12','2QN','2Q','1Q']],
    ['74153', ['1G','B','1C3','1C2','1C1','1C0','1Y','GND','2Y','2C0','2C1','2C2','2C3','A','2G','VCC']],
  ] as const)('%s preserves the manufacturer DIP pin order', (type, expected) => {
    // TI SDLS118 p1, SDLS120 p1 and SDLS055A p1, respectively.
    expect(PARTS[type].pins({}).map((pin) => pin.id)).toEqual(expected);
  });

  it.each(['7473', '74ls73a'])('%s implements JK hold/set/reset/toggle and asynchronous clear', (type) => {
    const h = fixture(type, { VCC: 5, '1CLR': 0, '2CLR': 1, '1CLK': 0, '2CLK': 0, '1J': 0, '1K': 0, '2J': 0, '2K': 0 });
    for (const initial of [0, 1]) for (const [j, k, expected] of [[0, 0, initial], [0, 1, 0], [1, 0, 1], [1, 1, initial ^ 1]]) {
      h.settle({ '1CLR': 0, '1CLK': 0 });
      h.settle({ '1CLR': 5, '1J': initial ? 5 : 0, '1K': 0, '1CLK': 5 }); h.settle({ '1CLK': 0 });
      h.settle({ '1J': j * 5, '1K': k * 5, '1CLK': 5 });
      expect(h.volts('1Q') > 2.5).toBe(Boolean(initial));
      h.settle({ '1CLK': 0 });
      expect(h.volts('1Q') > 2.5).toBe(Boolean(expected));
      expect(h.volts('1QN') > 2.5).toBe(!expected);
      expect(h.volts('2Q')).toBeLessThan(.1);
    }
    h.settle({ '1J': 5, '1K': 0, '1CLK': 5 }); h.settle({ '1CLK': 0 });
    h.settle({ '1CLR': 0 }); expect(h.volts('1Q')).toBeLessThan(.1);
    h.settle({ VCC: 0 }); expect(h.volts('1QN')).toBeLessThan(.1);
  });

  it('distinguishes 7473 high-pulse capture from LS73A falling-edge capture', () => {
    for (const type of ['7473', '74ls73a']) {
      const h = fixture(type, { VCC: 5, '1CLR': 5, '2CLR': 0, '1CLK': 0, '1J': 0, '1K': 0 });
      h.settle({ '1CLK': 5 });
      h.settle({ '1CLK': 0, '1J': 5 });
      expect(h.volts('1Q') > 2.5).toBe(type === '74ls73a');
    }
  });

  it.each(['7475', '74ls75'])('%s has separate transparent enables and retains all four bits', (type) => {
    const h = fixture(type, { VCC: 5, LE12: 5, LE34: 5, '1D': 0, '2D': 0, '3D': 0, '4D': 0 });
    for (let value = 0; value < 16; value++) {
      h.settle({ LE12: 5, LE34: 5, ...Object.fromEntries([1, 2, 3, 4].map((n) => [`${n}D`, (value & (1 << (n - 1))) ? 5 : 0])) });
      for (let n = 1; n <= 4; n++) {
        expect(h.volts(`${n}Q`) > 2.5).toBe(Boolean(value & (1 << (n - 1))));
        expect(h.volts(`${n}QN`) > 2.5).toBe(!Boolean(value & (1 << (n - 1))));
      }
      h.settle({ LE12: 0 });
      h.settle({ '1D': (value & 1) ? 0 : 5, '2D': (value & 2) ? 0 : 5, '3D': 0, '4D': 0 });
      expect(h.volts('1Q') > 2.5).toBe(Boolean(value & 1));
      expect(h.volts('2Q') > 2.5).toBe(Boolean(value & 2));
      expect(h.volts('3Q')).toBeLessThan(.1); expect(h.volts('4Q')).toBeLessThan(.1);
    }
  });

  it.each(['74153', '74ls153', '74hc153'])('%s selects both 4:1 channels and disables them independently', (type) => {
    const inputs: Record<string, number> = { VCC: 5, A: 0, B: 0, '1G': 0, '2G': 0 };
    for (let n = 1; n <= 2; n++) for (let i = 0; i < 4; i++) inputs[`${n}C${i}`] = 0;
    const h = fixture(type, inputs, { '1Y': 1000, '2Y': 1000 });
    for (let value = 0; value < 16; value++) for (let selected = 0; selected < 4; selected++) {
      h.settle({ A: (selected & 1) ? 5 : 0, B: (selected & 2) ? 5 : 0,
        ...Object.fromEntries([0, 1, 2, 3].flatMap((i) => [[`1C${i}`, (value & (1 << i)) ? 5 : 0], [`2C${i}`, (value & (1 << i)) ? 0 : 5]])) });
      expect(h.volts('1Y') > 2.5).toBe(Boolean(value & (1 << selected)));
      expect(h.volts('2Y') > 2.5).toBe(!Boolean(value & (1 << selected)));
    }
    h.settle({ '1G': 5, '2G': 0, '2C3': 5 });
    expect(h.volts('1Y')).toBeLessThan(.1); expect(h.volts('2Y')).toBeGreaterThan(4.5);
    h.settle({ '2G': 5 }); expect(h.volts('2Y')).toBeLessThan(.1);
  });

  it.each(['74138', '74ls138', '74hc138'])('%s decodes every address and honors all enable polarities', (type) => {
    const h = fixture(type, { VCC: 5, A0: 0, A1: 0, A2: 0, E1: 0, E2: 0, E3: 5 });
    for (let address = 0; address < 8; address++) for (let enable = 0; enable < 8; enable++) {
      h.settle({ A0: (address & 1) ? 5 : 0, A1: (address & 2) ? 5 : 0, A2: (address & 4) ? 5 : 0,
        E1: (enable & 1) ? 5 : 0, E2: (enable & 2) ? 5 : 0, E3: (enable & 4) ? 5 : 0 });
      for (let i = 0; i < 8; i++) expect(h.volts(`Y${i}`) < 2.5).toBe(enable === 4 && address === i);
    }
  });

  it.each(['74148', '74hc148'])('%s encodes all input combinations with priority and cascade flags', (type) => {
    const h = fixture(type, { VCC: 5, EI: 0, ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`I${i}`, 5])) });
    for (let active = 0; active < 256; active++) {
      h.settle(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`I${i}`, (active & (1 << i)) ? 0 : 5])));
      const expected = active ? 7 - Math.floor(Math.log2(active)) : 7;
      for (let i = 0; i < 3; i++) expect(h.volts(`A${i}`) > 2.5).toBe(Boolean(expected & (1 << i)));
      expect(h.volts('GS') > 2.5).toBe(active === 0);
      expect(h.volts('EO') > 2.5).toBe(active !== 0);
    }
    h.settle({ EI: 5 });
    for (const pin of ['A0', 'A1', 'A2', 'GS', 'EO']) expect(h.volts(pin)).toBeGreaterThan(4.5);
  });
});
