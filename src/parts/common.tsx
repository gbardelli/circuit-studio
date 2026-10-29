// Recursos SVG compartidos (gradientes, sombras) y piezas de dibujo reutilizables.
// Se montan una sola vez en el documento; cualquier SVG los referencia por id.

export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="g-metal" x1="0" x2="1">
          <stop offset="0" stopColor="#8d949c" />
          <stop offset="0.45" stopColor="#e9edf0" />
          <stop offset="1" stopColor="#7e858d" />
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
          <stop offset="0" stopColor="#0f8f97" />
          <stop offset="1" stopColor="#0a6f76" />
        </linearGradient>
        <linearGradient id="g-chip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2d31" />
          <stop offset="1" stopColor="#141518" />
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
        <radialGradient id="g-glow">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="currentColor" stopOpacity="0.8" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
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
  return <line x1={x} y1={y0} x2={x} y2={y1} stroke="#a8afb6" strokeWidth={w} strokeLinecap="round" />;
}

export function Glow({ cx, cy, r, color, intensity }: { cx: number; cy: number; r: number; color: string; intensity: number }) {
  if (intensity <= 0.01) return null;
  return <circle cx={cx} cy={cy} r={r} fill="url(#g-glow)" style={{ color }} opacity={Math.min(1, intensity)} pointerEvents="none" />;
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
  return Math.min(1, Math.pow(current / nominal, 0.55));
}
