import { useId } from 'react';

/** Icono: escuadra con degradado azul→verde y una onda PWM blanca que acaba en un nodo. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8dff" />
          <stop offset="0.55" stopColor="#2f9ee8" />
          <stop offset="1" stopColor="#22c58b" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      <rect x="0" y="0" width="32" height="32" rx="9" fill={`url(#${id}-shine)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" strokeOpacity="0.22" />
      <path d="M6.5 20.5h3.6v-9h5.4v9h4.8v-9h2.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.6" cy="11.5" r="2.6" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span style={{ fontFamily: 'var(--brand)', fontWeight: 800, fontSize: size, letterSpacing: '-0.04em', lineHeight: 1 }}>
      Circuit<span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Studio</span>
    </span>
  );
}
