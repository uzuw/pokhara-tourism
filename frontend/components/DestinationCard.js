'use client';
import Link from 'next/link';

export default function DestinationCard({ d }) {
  const img = d.image || '/assets/images/phewa-lake.jpg';
  const tags = (d.tags || '').split(',').slice(0, 3).map((t) => t.trim()).filter(Boolean);
  return (
    <Link href={`/destination/${d.slug}`} className="card">
      <div className="card-media">
        <img src={img} alt={d.name} loading="lazy" onError={(e) => { e.currentTarget.src = '/assets/images/phewa-lake.jpg'; }} />
        <div className="card-badge">{d.category}</div>
        {d.avg_rating > 0 && <div className="card-rating">★ {d.avg_rating.toFixed(1)}</div>}
      </div>
      <div className="card-body">
        <h3>{d.name}</h3>
        <p>{d.short_desc}</p>
        <div className="card-meta"><div className="tag-row">{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div></div>
      </div>
    </Link>
  );
}
