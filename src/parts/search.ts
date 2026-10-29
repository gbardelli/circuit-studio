import type { PartDef } from './types';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const subsequence = (needle: string, hay: string) => {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
};

/** Exact references win, followed by names, aliases, functions and typo matches. */
export function scorePart(def: PartDef, query: string): number {
  const q = norm(query.trim());
  if (!q) return 1;
  const reference = norm(def.partNumber ?? '');
  const compact = q.replace(/\s+/g, '');
  if (reference && (reference === compact || reference === `74hc${compact}`)) return 100;
  const hay = norm([def.name, reference, def.family ?? '', ...def.keywords, def.category].join(' '));
  const words = hay.split(/[^a-z0-9]+/);
  const description = norm(def.description);
  let total = 0;
  for (const token of q.split(/\s+/)) {
    if (words.includes(token)) total += 12;
    else if (words.some((word) => word.startsWith(token))) total += 8;
    else if (hay.includes(token)) total += 5;
    else if (description.includes(token)) total += 3;
    else if (token.length >= 3 && words.some((word) => subsequence(token, word))) total += 1;
    else return 0;
  }
  return total;
}
