/**
 * Floating petals layer rendered only in bloom theme.
 * Pure SVG + CSS animation (positioning lives in styles.css under .bloom-backdrop).
 */
function Petal({ tone = "#FFB6CE" }: { tone?: string }) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <ellipse cx="16" cy="16" rx="6" ry="11" fill={tone} />
      <ellipse cx="16" cy="14" rx="2.5" ry="6" fill="rgba(255,255,255,0.5)" />
    </svg>
  );
}

export function BloomBackdrop() {
  return (
    <div className="bloom-backdrop" aria-hidden>
      <Petal tone="#FFB6CE" />
      <Petal tone="#FFD2DD" />
      <Petal tone="#F7A6C2" />
      <Petal tone="#FFC8DA" />
      <Petal tone="#FFB0CC" />
      <Petal tone="#FFE0EA" />
    </div>
  );
}
