// Stylised Swayambhunath-style stupa silhouette. Uses currentColor so it
// can be themed (gold on dark footer, teal on light sections).
export default function Stupa({ className = '', title = 'Stupa' }) {
  return (
    <svg viewBox="0 0 120 160" className={className} role="img" aria-label={title}>
      {/* spire */}
      <path d="M60 4 L66 26 L54 26 Z" fill="currentColor" />
      <rect x="56" y="26" width="8" height="6" fill="currentColor" />
      <rect x="54" y="32" width="12" height="6" fill="currentColor" />
      <rect x="52" y="38" width="16" height="6" fill="currentColor" />
      <rect x="50" y="44" width="20" height="6" fill="currentColor" />
      {/* harmika with eyes */}
      <rect x="46" y="50" width="28" height="22" rx="2" fill="currentColor" />
      <g fill="rgba(255,255,255,.85)">
        <circle cx="55" cy="61" r="3.4" /><circle cx="65" cy="61" r="3.4" />
        <path d="M59 66 q1 4 2 0" stroke="rgba(255,255,255,.85)" strokeWidth="1.4" fill="none" />
      </g>
      {/* dome */}
      <path d="M34 72 Q60 50 86 72 L86 96 Q60 108 34 96 Z" fill="currentColor" />
      {/* base */}
      <rect x="28" y="96" width="64" height="10" rx="3" fill="currentColor" />
      <rect x="22" y="106" width="76" height="12" rx="3" fill="currentColor" />
      <rect x="16" y="118" width="88" height="14" rx="3" fill="currentColor" />
      {/* prayer-flag mast */}
      <line x1="60" y1="4" x2="60" y2="-2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
