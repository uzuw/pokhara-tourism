// Brand mark for Hamro Pokhara — a minimal stupa glyph inside a teal disc.
export default function Logo({ size = 34, className = '' }) {
  return (
    <span className={`brand-logo ${className}`} style={{ width: size, height: size, fontSize: size * 0.62 }}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="url(#lg)" />
        <g fill="#fff">
          <path d="M16 6 l2.4 6 h-4.8 Z" />
          <rect x="14.4" y="12" width="3.2" height="2.4" />
          <rect x="13.4" y="14.4" width="5.2" height="2.4" rx="1" />
          <path d="M10 17 q6 -4 12 0 v3 q-6 3 -12 0 Z" />
          <rect x="9" y="20" width="14" height="2" rx="1" />
          <rect x="7.5" y="22" width="17" height="2.4" rx="1" />
        </g>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0e7490" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}
