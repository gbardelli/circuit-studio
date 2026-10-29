import { useId } from 'react';

// Recursos SVG compartidos (gradientes, sombras) y piezas de dibujo reutilizables.
// Se montan una sola vez en el documento; cualquier SVG los referencia por id.

export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="g-metal" x1="0" x2="1">
          <stop offset="0" stopColor="#69717a" />
          <stop offset="0.07" stopColor="#c8cdd2" />
          <stop offset="0.26" stopColor="#e5e9ec" />
          <stop offset="0.5" stopColor="#aeb7bf" />
          <stop offset="0.8" stopColor="#d6dce1" />
          <stop offset="1" stopColor="#737b84" />
        </linearGradient>
        <linearGradient id="g-metal-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f3f5" />
          <stop offset="0.5" stopColor="#b9c0c7" />
          <stop offset="1" stopColor="#808891" />
        </linearGradient>
        <linearGradient id="g-board" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfaf6" />
          <stop offset="1" stopColor="#e9e5dc" />
        </linearGradient>
        <linearGradient id="g-pcb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#228f92" />
          <stop offset="0.42" stopColor="#147e82" />
          <stop offset="1" stopColor="#09696e" />
        </linearGradient>
        <linearGradient id="g-chip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4c50" />
          <stop offset="0.08" stopColor="#303237" />
          <stop offset="0.55" stopColor="#26282c" />
          <stop offset="0.92" stopColor="#1d1f22" />
          <stop offset="1" stopColor="#101114" />
        </linearGradient>
        <linearGradient id="g-header" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#111" />
        </linearGradient>
        <linearGradient id="g-resistor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2dcb3" />
          <stop offset="0.5" stopColor="#e3c38f" />
          <stop offset="1" stopColor="#c9a46b" />
        </linearGradient>
        <linearGradient id="g-black-plastic" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3c40" />
          <stop offset="1" stopColor="#16171a" />
        </linearGradient>
        <linearGradient id="g-cap" x1="0" x2="1">
          <stop offset="0" stopColor="#1d3b7a" />
          <stop offset="0.45" stopColor="#3f68c0" />
          <stop offset="1" stopColor="#152c5e" />
        </linearGradient>
        <linearGradient id="g-servo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b78d8" />
          <stop offset="1" stopColor="#2552a3" />
        </linearGradient>
        <linearGradient id="g-battery" x1="0" x2="1">
          <stop offset="0" stopColor="#1f1f22" />
          <stop offset="0.5" stopColor="#3a3a40" />
          <stop offset="1" stopColor="#151517" />
        </linearGradient>
        <radialGradient id="g-knob" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#5c6067" />
          <stop offset="1" stopColor="#1c1d20" />
        </radialGradient>
        <linearGradient id="g-anodized" x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0" stopColor="#d9dde0" />
          <stop offset="0.07" stopColor="#b4bbc1" />
          <stop offset="0.55" stopColor="#c4cbd0" />
          <stop offset="1" stopColor="#9ca5ad" />
        </linearGradient>
        <radialGradient id="g-led-glass" cx="0.3" cy="0.2" r="0.85">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#160000" stopOpacity="0.32" />
        </radialGradient>
        <pattern id="p-epoxy" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="0.6" cy="0.8" r="0.22" fill="#fff" opacity="0.09" />
          <circle cx="2" cy="2.2" r="0.3" fill="#000" opacity="0.12" />
        </pattern>
        <pattern id="p-brushed" width="3" height="2" patternUnits="userSpaceOnUse">
          <path d="M0 .5H3" stroke="#fff" strokeWidth="0.2" opacity="0.14" />
          <path d="M0 1.5H2" stroke="#26333b" strokeWidth="0.2" opacity="0.1" />
        </pattern>
        <pattern id="p-mesh" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#161b1e" />
          <path d="M0 .5H2M.5 0V2" stroke="#727c83" strokeWidth="0.35" opacity="0.6" />
        </pattern>
        <linearGradient id="g-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
        <filter id="f-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.28" />
        </filter>
        <filter id="f-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
    </svg>
  );
}

/** Patilla metálica de un componente (de y0 a y1 en x). */
export function Leg({ x, y0, y1, w = 1.6 }: { x: number; y0: number; y1: number; w?: number }) {
  return <g><line x1={x} y1={y0} x2={x} y2={y1} stroke="#747d85" strokeWidth={w} strokeLinecap="round" /><line x1={x - w * 0.12} y1={y0} x2={x - w * 0.12} y2={y1} stroke="#e1e7eb" strokeWidth={w * 0.35} strokeLinecap="round" /></g>;
}

export function Glow({ cx, cy, r, color, intensity }: { cx: number; cy: number; r: number; color: string; intensity: number }) {
  const id = `glow-${useId().replace(/:/g, '')}`;
  if (intensity <= 0.01) return null;
  return <g pointerEvents="none">
    <defs><radialGradient id={id}>
      <stop offset="0" stopColor={color} stopOpacity="0.72" />
      <stop offset="0.2" stopColor={color} stopOpacity="0.5" />
      <stop offset="0.5" stopColor={color} stopOpacity="0.18" />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient></defs>
    <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} opacity={Math.min(1, intensity * 1.3)} />
  </g>;
}

export function WarningBadge({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <title>{label}</title>
      <circle r="7" fill="#f5b83d" stroke="#3a2a06" strokeWidth="1" />
      <text y="3.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#3a2a06">
        !
      </text>
    </g>
  );
}

/** Brillo perceptual de un LED a partir de su corriente media. */
export function ledIntensity(current: number, nominal = 0.02) {
  if (!(current > 1e-5)) return 0;
  return Math.min(1, Math.pow(current / (nominal * 0.6), 0.42));
}

/** Small assemblies share a material language without adding per-object SVG filters. */
export function Smd({ x, y, vertical = false, ceramic = false }: { x: number; y: number; vertical?: boolean; ceramic?: boolean }) {
  return <g transform={`translate(${x} ${y})${vertical ? ' rotate(90)' : ''}`}>
    <rect x={-1} y={-2.7} width={10} height={5.4} rx={1.1} fill="#064e53" stroke="#c3d2cb" strokeOpacity="0.3" strokeWidth="0.3" />
    <rect x={0} y={-1.7} width={8} height={3.4} rx={0.7} fill="url(#g-metal)" />
    <rect x={1.6} y={-1.8} width={4.8} height={3.6} rx={0.35} fill={ceramic ? '#a18c66' : '#25292b'} />
    <path d="M2 -1.5h4" stroke="#fff" strokeOpacity="0.12" strokeWidth="0.4" />
  </g>;
}

export function Screw({ x, y, r = 2 }: { x: number; y: number; r?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r={r + 0.5} fill="#62696f" />
    <circle r={r} fill="url(#g-metal-v)" stroke="#5b6268" strokeWidth="0.4" />
    <path d={`M${-r * 0.6} 0h${r * 1.2}M0 ${-r * 0.6}v${r * 1.2}`} stroke="#555d64" strokeWidth="0.55" />
  </g>;
}
