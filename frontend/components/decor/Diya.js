// A diya (oil lamp) with a flickering flame — used as a small Hindu motif.
export default function Diya({ className = '', size = 40 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={`diya ${className}`} role="img" aria-label="Diya lamp">
      {/* flame */}
      <path className="diya-flame" d="M24 6 C28 14 30 18 24 22 C18 18 20 14 24 6 Z" fill="#ff9e2b" />
      <path className="diya-flame-core" d="M24 12 C26 16 27 18 24 21 C21 18 22 16 24 12 Z" fill="#ffd66b" />
      {/* lamp body */}
      <path d="M10 30 Q24 22 38 30 Q36 38 24 38 Q12 38 10 30 Z" fill="#7c4a21" />
      <path d="M10 30 Q24 26 38 30" fill="none" stroke="#a9712f" strokeWidth="2" />
      <ellipse cx="24" cy="30" rx="14" ry="3" fill="#b9793a" />
      {/* glow */}
      <circle cx="24" cy="20" r="3" fill="#ffcf6b" opacity=".5" className="diya-glow" />
    </svg>
  );
}
