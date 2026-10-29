/** The PWM signal is the mark. Its surrounding surface belongs to the UI. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 27h8V13h8v14h8V13h6" fill="none" stroke="#3ee08f" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="35" cy="13" r="2.6" fill="#3ee08f" />
    </svg>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return <span style={{ fontFamily: 'var(--brand)', fontWeight: 300, fontSize: size, letterSpacing: '-0.045em', lineHeight: 1 }}>circuit<b style={{ fontWeight: 800 }}>studio</b></span>;
}
