'use client';
// String of Tibetan prayer flags (lung ta) — five traditional colours.
// Sits as a thin decorative arc; flags gently flutter via CSS.
const COLORS = ['#2b6cb0', '#ffffff', '#c53030', '#2f855a', '#d69e2e'];

export default function PrayerFlags({ className = '', count = 11, opacity = 1 }) {
  const W = 1200, H = 200;
  const flags = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const x = 40 + t * 1120;
    const y = 18 + Math.pow((x - 600) / 600, 2) * 120;
    const rot = -7 + t * 14;
    return { x, y, rot, color: COLORS[i % 5], i };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`prayer-flags ${className}`} style={{ opacity }} aria-hidden="true">
      <path d={`M40,18 Q600,170 1160,18`} stroke="rgba(120,120,120,.35)" strokeWidth="2" fill="none" />
      {flags.map((f) => (
        <g key={f.i} transform={`rotate(${f.rot} ${f.x} ${f.y + 8})`}>
          <line x1={f.x} y1={f.y} x2={f.x} y2={f.y + 9} stroke="rgba(120,120,120,.4)" strokeWidth="1.5" />
          <rect className="flag-leaf" x={f.x - 22} y={f.y + 9} width="44" height="56" rx="3" fill={f.color}
            stroke="rgba(0,0,0,.06)" style={{ animationDelay: `${f.i * 0.25}s` }} />
          <circle cx={f.x} cy={f.y + 37} r="6" fill={f.color === '#ffffff' ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.7)'} />
        </g>
      ))}
    </svg>
  );
}
