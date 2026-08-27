// A lotus / mandala motif — subtle Hindu decorative divider.
export default function Mandala({ className = '', size = 120, color = 'currentColor' }) {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label="Lotus mandala">
      <g fill="none" stroke={color} strokeWidth="1.4" opacity=".9">
        <circle cx="60" cy="60" r="54" />
        <circle cx="60" cy="60" r="40" />
        {petals.map((a) => (
          <path key={a} transform={`rotate(${a} 60 60)`}
            d="M60 20 C72 34 72 46 60 60 C48 46 48 34 60 20 Z" fill={color} opacity=".12" />
        ))}
        <circle cx="60" cy="60" r="14" fill={color} opacity=".18" />
        <circle cx="60" cy="60" r="6" fill={color} opacity=".5" />
      </g>
    </svg>
  );
}
