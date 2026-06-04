/**
 * Floating bloom layer: petals + hearts + sparkles + corner flowers.
 * Visible only when <html data-theme="bloom">. All positioning + animation
 * lives in styles.css (.bloom-backdrop ...).
 */
function Petal({ tone = "#FFB6CE" }: { tone?: string }) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <ellipse cx="16" cy="16" rx="6" ry="11" fill={tone} />
      <ellipse cx="16" cy="14" rx="2.5" ry="6" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

function Heart({ tone = "#FF6FA3" }: { tone?: string }) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M16 27s-10-6.2-10-13.4C6 9.5 9 7 12.2 7c2 0 3.7 1 3.8 2.8C16.1 8 17.8 7 19.8 7 23 7 26 9.5 26 13.6 26 20.8 16 27 16 27z"
        fill={tone}
      />
      <path
        d="M12.5 11c-1.2.4-2 1.4-2.2 2.6"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function Flower({ tone = "#FFB6CE", core = "#FFD27A" }: { tone?: string; core?: string }) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g>
        <ellipse cx="16" cy="8" rx="3.5" ry="6" fill={tone} />
        <ellipse cx="16" cy="24" rx="3.5" ry="6" fill={tone} />
        <ellipse cx="8" cy="16" rx="6" ry="3.5" fill={tone} />
        <ellipse cx="24" cy="16" rx="6" ry="3.5" fill={tone} />
        <circle cx="16" cy="16" r="3.4" fill={core} />
      </g>
    </svg>
  );
}

function Sparkle({ tone = "#FFE2EC" }: { tone?: string }) {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M8 0 L9.2 6.8 L16 8 L9.2 9.2 L8 16 L6.8 9.2 L0 8 L6.8 6.8 Z" fill={tone} />
    </svg>
  );
}

export function BloomBackdrop() {
  return (
    <div className="bloom-backdrop" aria-hidden>
      {/* petals */}
      <Petal tone="#FFB6CE" />
      <Petal tone="#FFD2DD" />
      <Petal tone="#F7A6C2" />
      <Petal tone="#FFC8DA" />
      {/* hearts */}
      <Heart tone="#FF6FA3" />
      <Heart tone="#FF9CC0" />
      <Heart tone="#E64C86" />
      <Heart tone="#FFB3CE" />
      {/* flowers */}
      <Flower tone="#FFB6CE" core="#FFD27A" />
      <Flower tone="#F58FB6" core="#FFFFFF" />
      <Flower tone="#FFD2DD" core="#FF6FA3" />
      {/* sparkles */}
      <Sparkle tone="#FFFFFF" />
      <Sparkle tone="#FFE2EC" />
      <Sparkle tone="#FFD27A" />
    </div>
  );
}
