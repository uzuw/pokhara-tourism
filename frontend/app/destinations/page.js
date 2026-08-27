'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import DestinationCard from '@/components/DestinationCard';
import { Reveal, Stagger, StaggerItem, HoverLift } from '@/components/Motion';

function DestinationsInner() {
  const params = useSearchParams();
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(params.get('cat') || '');

  useEffect(() => {
    api('/api/destinations').then((r) => setCats([...new Set(r.destinations.map((d) => d.category))].sort())).catch(() => {});
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, cat]);

  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (cat) sp.set('category', cat);
    setItems(null);
    try {
      const r = await api('/api/destinations?' + sp.toString());
      setItems(r.destinations);
    } catch { setItems([]); }
  }, [q, cat]);

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="container">
        <Reveal><div className="section-head" style={{ textAlign: 'left', margin: '0 0 26px', maxWidth: 'none' }}>
          <span className="eyebrow">🌊 All spots</span>
          <h2 style={{ margin: '8px 0' }}>Where to go in Pokhara</h2>
          <p>Filter by category or search. Click any card to see the map and reviews.</p>
        </div></Reveal>

        <Reveal delay={0.08}><div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 26 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lakes, temples, caves…" style={{ flex: 1, minWidth: 220, padding: '12px 16px', borderRadius: 999, border: '1.5px solid var(--line)', font: 'inherit', background: '#fff' }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ padding: '12px 16px', borderRadius: 999, border: '1.5px solid var(--line)', font: 'inherit', background: '#fff' }}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div></Reveal>

        {items === null ? (
          <div className="grid cards">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 330 }} />)}</div>
        ) : items.length ? (
          <Stagger className="grid cards">
            {items.map((d) => (
              <StaggerItem key={d.id}><HoverLift><DestinationCard d={d} /></HoverLift></StaggerItem>
            ))}
          </Stagger>
        ) : (
          <p className="muted center" style={{ marginTop: 30 }}>No destinations match your search.</p>
        )}
      </div>
    </section>
  );
}

export default function DestinationsPage() {
  return (
    <Suspense fallback={<section className="section center"><div className="spinner" style={{ borderColor: 'var(--teal-500)', borderTopColor: 'transparent' }} /></section>}>
      <DestinationsInner />
    </Suspense>
  );
}
