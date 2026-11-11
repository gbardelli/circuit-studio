import { describe, expect, it } from 'vitest';
import { PARTS } from '../parts';
import { MANUFACTURER_REFERENCES } from '../parts/manufacturerReferences';

describe('manufacturer references', () => {
  it('only exposes references for known components and HTTPS sources', () => {
    for (const [type, references] of Object.entries(MANUFACTURER_REFERENCES)) {
      expect(PARTS[type], type).toBeDefined();
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) {
        expect(new URL(reference.datasheet).protocol).toBe('https:');
        expect(reference.partNumber).toBeTruthy();
        expect(reference.manufacturer).toBeTruthy();
      }
    }
  });
  it('uses the shared manufacturer document for the 74LS48', () => {
    expect(MANUFACTURER_REFERENCES['74ls48'][0].datasheet).toContain('sn74ls47.pdf');
  });
});
