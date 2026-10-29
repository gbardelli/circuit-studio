import { describe, expect, it } from 'vitest';
import { shouldPlayIntro } from './Startup';

describe('startup animation preference', () => {
  it('skips the intro for reduced motion even on a first visit', () => {
    expect(shouldPlayIntro(null, true)).toBe(false);
  });

  it('plays once per session and skips later document navigations', () => {
    expect(shouldPlayIntro({ getItem: () => null }, false)).toBe(true);
    expect(shouldPlayIntro({ getItem: () => '1' }, false)).toBe(false);
  });

  it('survives browsers that deny session storage', () => {
    const storage = { getItem: () => { throw new DOMException('Storage blocked', 'SecurityError'); } };
    expect(shouldPlayIntro(storage, false)).toBe(true);
    expect(shouldPlayIntro(storage, true)).toBe(false);
  });
});
