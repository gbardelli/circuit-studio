import { memo, useMemo } from 'react';
import type { PinDef, Props } from '../core/types';
import type { PartDef, RenderProps } from './types';

// Geometría (local): columnas cada 10 desde x=30; filas a-e (60–100), canal central,
// f-j (130–170); rieles arriba (20, 30) y abajo (200, 210). Separación e→f = 0.3".
const ROWS_TOP = ['a', 'b', 'c', 'd', 'e'];
const ROWS_BOTTOM = ['f', 'g', 'h', 'i', 'j'];
const ROW_Y: Record<string, number> = { a: 60, b: 70, c: 80, d: 90, e: 100, f: 130, g: 140, h: 150, i: 160, j: 170 };
const RAILS: { id: string; y: number; sign: '+' | '-' }[] = [
  { id: 'tp', y: 20, sign: '+' },
  { id: 'tn', y: 30, sign: '-' },
  { id: 'bp', y: 200, sign: '+' },
  { id: 'bn', y: 210, sign: '-' },
];
const X0 = 30;
const HEIGHT = 230;

const cols = (props: Props) => Number(props.cols ?? 30);
const colX = (c: number) => X0 + (c - 1) * 10;
const railHole = (c: number) => (c - 1) % 6 !== 5;
const width = (n: number) => colX(n) + 30;

const pinCache = new Map<number, PinDef[]>();
function pins(props: Props): PinDef[] {
  const n = cols(props);
  const hit = pinCache.get(n);
  if (hit) return hit;
  const list: PinDef[] = [];
  for (let c = 1; c <= n; c++) {
    for (const r of [...ROWS_TOP, ...ROWS_BOTTOM]) list.push({ id: `${r}${c}`, x: colX(c), y: ROW_Y[r], kind: 'socket', label: `${r.toUpperCase()}${c}` });
    if (railHole(c)) for (const rail of RAILS) list.push({ id: `${rail.id}${c}`, x: colX(c), y: rail.y, kind: 'socket', label: `riel ${rail.sign} ${c}` });
  }
  pinCache.set(n, list);
  return list;
}

function internal(props: Props): string[][] {
  const n = cols(props);
  const groups: string[][] = [];
  for (let c = 1; c <= n; c++) {
    groups.push(ROWS_TOP.map((r) => `${r}${c}`));
    groups.push(ROWS_BOTTOM.map((r) => `${r}${c}`));
  }
  for (const rail of RAILS) {
    const g: string[] = [];
    for (let c = 1; c <= n; c++) if (railHole(c)) g.push(`${rail.id}${c}`);
    groups.push(g);
  }
  return groups;
}

function holesPath(n: number) {
  const s = 5.2;
  const h = s / 2;
  let d = '';
  for (const p of pins({ cols: n })) d += `M${p.x - h} ${p.y - h}h${s}v${s}h${-s}z`;
  return d;
}

const BreadboardRender = memo(function BreadboardRender({ part }: RenderProps) {
  const n = cols(part.props);
  const w = width(n);
  const d = useMemo(() => holesPath(n), [n]);
  const labels = useMemo(() => {
    const out: JSX.Element[] = [];
    for (let c = 1; c <= n; c++) {
      if (c === 1 || c % 5 === 0) {
        out.push(
          <text key={`t${c}`} x={colX(c)} y={51} textAnchor="middle" fontSize="5.5" fill="#8e8a80">
            {c}
          </text>,
          <text key={`b${c}`} x={colX(c)} y={184} textAnchor="middle" fontSize="5.5" fill="#8e8a80">
            {c}
          </text>,
        );
      }
    }
    for (const r of [...ROWS_TOP, ...ROWS_BOTTOM]) {
      out.push(
        <text key={`l${r}`} x={14} y={ROW_Y[r] + 2} textAnchor="middle" fontSize="6" fill="#8e8a80">
          {r}
        </text>,
        <text key={`r${r}`} x={w - 14} y={ROW_Y[r] + 2} textAnchor="middle" fontSize="6" fill="#8e8a80">
          {r}
        </text>,
      );
    }
    return out;
  }, [n, w]);
  return (
    <g>
      <rect x={0} y={0} width={w} height={HEIGHT} rx={6} fill="url(#g-board)" stroke="#d3cec2" strokeWidth={1} filter="url(#f-shadow)" />
      {/* bandas de rieles */}
      <rect x={4} y={8} width={w - 8} height={34} rx={3} fill="#f6f4ee" />
      <rect x={4} y={188} width={w - 8} height={34} rx={3} fill="#f6f4ee" />
      <line x1={20} x2={w - 20} y1={12} y2={12} stroke="#d64541" strokeWidth={1.4} />
      <line x1={20} x2={w - 20} y1={38} y2={38} stroke="#3f6fd1" strokeWidth={1.4} />
      <line x1={20} x2={w - 20} y1={192} y2={192} stroke="#d64541" strokeWidth={1.4} />
      <line x1={20} x2={w - 20} y1={218} y2={218} stroke="#3f6fd1" strokeWidth={1.4} />
      <text x={12} y={23} fontSize="8" fill="#d64541" textAnchor="middle" fontWeight="700">+</text>
      <text x={12} y={33} fontSize="9" fill="#3f6fd1" textAnchor="middle" fontWeight="700">−</text>
      <text x={12} y={203} fontSize="8" fill="#d64541" textAnchor="middle" fontWeight="700">+</text>
      <text x={12} y={213} fontSize="9" fill="#3f6fd1" textAnchor="middle" fontWeight="700">−</text>
      {/* canal central */}
      <rect x={6} y={110} width={w - 12} height={10} rx={2} fill="#e2ddd2" />
      <rect x={6} y={114} width={w - 12} height={2} fill="#d5cfc2" />
      <path d={`M6 110H${w-6}M6 228H${w-6}M1 4V226`} stroke="#fff" strokeWidth="0.8" opacity="0.7" fill="none" />
      <path d={`M6 120H${w-6}M6 226H${w-6}`} stroke="#b4b3ad" strokeWidth="0.6" opacity="0.7" />
      <path d={d} fill="#32342f" stroke="#b2b2a9" strokeWidth="0.9" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#fff" strokeWidth={0.5} transform="translate(0.4,0.7)" opacity={0.5} />
      {labels}
    </g>
  );
});

function makeBreadboard(type: string, name: string, n: number, description: string): PartDef {
  return {
    type,
    name,
    category: 'Protoboards',
    description,
    keywords: ['protoboard', 'breadboard', 'placa de pruebas', String(n)],
    defaults: { cols: n },
    pins,
    internal,
    bounds: (props) => ({ x: 0, y: 0, w: width(cols(props)), h: HEIGHT }),
    model: 'Pasivo',
    Render: BreadboardRender,
    thumbScale: 0.9,
  };
}

export const breadboardHalf = makeBreadboard('breadboard-half', 'Protoboard 400', 30, 'Media protoboard: 30 columnas, 4 rieles de alimentación.');
export const breadboardFull = makeBreadboard('breadboard-full', 'Protoboard 830', 63, 'Protoboard completa: 63 columnas, rieles a todo lo largo.');
export const breadboardMini = makeBreadboard('breadboard-mini', 'Protoboard mini 170', 17, 'Mini protoboard de 17 columnas para montajes compactos.');
