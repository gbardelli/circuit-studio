import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: 'none' as string | null }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => async (strings: TemplateStringsArray) => strings.join('').includes('SELECT link_access') ? mocks.access === null ? [] : [{ link_access: mocks.access }] : [] }));
import { publicViewRole } from '../../api/_lib/db';
describe('public link policy', () => {
  it.each(['view', 'edit'])('allows anonymous viewers for %s links', async access => {
    mocks.access = access; expect(await publicViewRole('public123')).toBe('viewer');
  });
  it.each(['none', null])('denies anonymous access for %s projects', async access => {
    mocks.access = access; expect(await publicViewRole('private123')).toBeNull();
  });
});
