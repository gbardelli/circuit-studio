import { describe, expect, it } from 'vitest';
import { PART_LIST, PARTS } from '../parts';
import { CATALOG_SECTIONS, catalogGroups, partLabel, sectionOf } from './catalog';
import { scorePart } from '../parts/search';

describe('library navigation', () => {
  it('keeps every catalog part reachable exactly once through the six sections', () => {
    const types = CATALOG_SECTIONS.flatMap((section) => catalogGroups(section.id).flatMap((group) => group.items.map((part) => part.type)));
    expect(new Set(types).size).toBe(PART_LIST.length);
    expect(types.length).toBe(PART_LIST.length);
    expect(types.sort()).toEqual(PART_LIST.map((part) => part.type).sort());
  });

  it('groups sensors, controls, drivers and power by their use', () => {
    expect(sectionOf(PARTS.ldr)).toBe('inputs');
    expect(sectionOf(PARTS['hc-sr04'])).toBe('inputs');
    expect(sectionOf(PARTS['dip-switch-6'])).toBe('inputs');
    expect(sectionOf(PARTS.l293d)).toBe('logic');
    expect(sectionOf(PARTS['bench-supply'])).toBe('power');
    const sensors = catalogGroups('inputs').find((group) => group.title === 'Sensores')!;
    expect(sensors.items.map((part) => part.type)).toEqual(expect.arrayContaining(['ldr', 'tmp36', 'hc-sr04']));
  });

  it('keeps exact chip references visible without badges or duplicated names', () => {
    expect(partLabel(PARTS['74hc138'])).toEqual({ title: '74HC138', detail: PARTS['74hc138'].name });
    expect(partLabel(PARTS.l293d).detail).not.toContain('L293D');
    expect(partLabel(PARTS['dip-switch-4'])).toEqual({ title: 'Interruptor DIP ×4', detail: null });
  });

  it('finds a chip reference across the entire catalog', () => {
    const matches = PART_LIST.map((part) => ({ part, score: scorePart(part, '138') })).sort((a, b) => b.score - a.score);
    expect(matches[0].part.type).toBe('74hc138');
    expect(matches[0].score).toBe(100);
  });
});
