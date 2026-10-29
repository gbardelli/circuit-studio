/** The PWM signal is the mark. Its surrounding surface belongs to the UI. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 20h4v-8h5v8h4v-8h3" fill="none" stroke="#3ee08f" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="12" r="2.2" fill="#3ee08f" />
    </svg>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return <span style={{ fontFamily: 'var(--brand)', fontWeight: 600, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1 }}>CircuitStudio</span>;
}
