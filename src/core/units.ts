// Prefijos SI tolerantes: "4k7", "10u", "2.2M", "220", "1meg", "100n", "0.5m".
const PREFIX: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  meg: 1e6,
  G: 1e9,
};

export function parseSI(input: string): number | null {
  const s = input.trim().replace(/\s+/g, '').replace(/(ohms?|Ω|hz|v|a|f|h|s)$/i, '');
  if (!s) return null;
  // Notación de resistencias: 4k7 = 4.7k
  const inline = s.match(/^(\d+)(meg|[pnuµmkKMG])(\d+)$/);
  if (inline) return Number(`${inline[1]}.${inline[3]}`) * PREFIX[inline[2]];
  const m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)(meg|[pnuµmkKMG])?$/i);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const p = m[2];
  if (!p) return base;
  const key = p.toLowerCase() === 'meg' ? 'meg' : p;
  return base * (PREFIX[key] ?? 1);
}

export function formatSI(value: number, unit = '', digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(value);
  const table: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  for (const [scale, prefix] of table) {
    if (abs >= scale * 0.9995) {
      const v = value / scale;
      return `${trim(v, digits)} ${prefix}${unit}`.trim();
    }
  }
  return `${trim(value / 1e-12, digits)} p${unit}`;
}

function trim(v: number, digits: number) {
  const s = Number(v.toPrecision(digits)).toString();
  return s;
}

// Código de colores de resistencias (4 bandas, tolerancia 5 %).
export const BAND_COLORS = ['#1b1b1b', '#7a4a1e', '#d8262a', '#f07d16', '#f3d21b', '#2f9a3c', '#2a5fc7', '#7b3fb5', '#8b8b8b', '#f5f5f5'];
export const GOLD = '#c9a43a';

export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0)) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** exp);
  if (sig >= 100) {
    sig = Math.round(sig / 10);
    exp += 1;
  }
  const d1 = Math.floor(sig / 10);
  const d2 = sig % 10;
  const mult = exp < 0 ? (exp === -1 ? GOLD : '#c0c0c0') : BAND_COLORS[Math.min(exp, 9)];
  return [BAND_COLORS[d1], BAND_COLORS[d2], mult, GOLD];
}
