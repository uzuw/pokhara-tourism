'use client';
// String of Tibetan prayer flags (lung ta) — five traditional colours.
// The string is drawn as a polyline THROUGH every flag's top, so the cord
// always touches each flag (no gap). The cord sags down in the middle
// (ends high, centre low) like a real hung banner; flags flutter via CSS.
const COLORS = ['#2b6cb0', '#ffffff', '#c53030', '#2f855a', '#d69e2e'];

export default function PrayerFlags({ className = '', count = 13, opacity = 1 }) {
  const W = 1200, H = 220;
  const flags = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const x = 30 + t * (W - 60);
    // sag: high at the ends, low at the centre -> downward catenary
    const y = 12 + Math.pow((x - W / 2) / (W / 2), 2) * 120;
    const rot = -4 + t * 8;
    return { x, y, rot, color: COLORS[i % 5], i };
  });
  // cord passes exactly through each flag's top point
  const cord = 'M' + flags.map((f) => `${f.x.toFixed(1)},${f.y.toFixed(1)}`).join(' L');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`prayer-flags ${className}`} style={{ opacity }} aria-hidden="true">
      <path d={cord} stroke="rgba(120,120,120,.4)" strokeWidth="2" fill="none" strokeLinejoin="round" />
      {flags.map((f) => (
        <g key={f.i} transform={`rotate(${f.rot} ${f.x} ${f.y + 8})`}>
          <rect className="flag-leaf" x={f.x - 19} y={f.y} width="38" height="50" rx="3" fill={f.color}
            stroke="rgba(0,0,0,.08)" style={{ animationDelay: `${f.i * 0.22}s` }} />
          <circle cx={f.x} cy={f.y + 34} r="5" fill={f.color === '#ffffff' ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.7)'} />
        </g>
      ))}
    </svg>
  );
}
