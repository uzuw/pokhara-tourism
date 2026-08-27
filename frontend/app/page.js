'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Reveal, Stagger, StaggerItem, HoverLift } from '@/components/Motion';
import PrayerFlags from '@/components/decor/PrayerFlags';
import Diya from '@/components/decor/Diya';

function DestinationCard({ d }) {
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

const CATEGORIES = [
  { c: 'Lake', e: '🏞️', t: 'Still water, big reflections' },
  { c: 'Viewpoint', e: '🌄', t: 'Sunrise over the Himalaya' },
  { c: 'Temple', e: '🛕', t: 'Sacred & serene' },
  { c: 'Cave', e: '🕳️', t: 'Limestone & legend' },
  { c: 'Waterfall', e: '💦', t: 'Where the river dives underground' },
  { c: 'Museum', e: '🏛️', t: 'Culture & mountaineering' },
];

export default function HomePage() {
  const [featured, setFeatured] = useState(null);

  useEffect(() => {
    api('/api/destinations?featured=1').then((r) => setFeatured(r.destinations)).catch(() => setFeatured([]));
    document.querySelectorAll('#heroStats .n').forEach((el) => {
      const target = +el.dataset.count; let cur = 0;
      const step = Math.max(1, Math.round(target / 40));
      const t = setInterval(() => { cur += step; if (cur >= target) { cur = target; clearInterval(t); } el.textContent = cur.toLocaleString(); }, 28);
    });
  }, []);

  return (
    <>
      <header className="hero">
        <div className="flags-banner"><PrayerFlags count={13} /></div>
        <div className="hero-bg" />
        <img className="hero-photo" src="/assets/images/sarangkot.jpg" alt="Sarangkot sunrise" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div className="container hero-content">
          <Reveal><span className="eyebrow">🏔️ Gandaki · Nepal</span></Reveal>
          <Reveal delay={0.08}>
            <h1>Find your way to <span className="hl">Hamro Pokhara</span></h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="lead">Lakes that mirror the Annapurna range, sunrise viewpoints, hidden caves and sacred temples — with live OpenStreetMap navigation to every spot.</p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="hero-cta">
              <Link href="/destinations" className="btn btn-primary">Explore destinations →</Link>
              <Link href="/map" className="btn btn-ghost">Open the map</Link>
            </div>
          </Reveal>
          <Reveal delay={0.32}>
            <div className="hero-stats" id="heroStats">
              <div className="stat"><div className="n" data-count="14">0</div><div className="l">Curated spots</div></div>
              <div className="stat"><div className="n" data-count="8">0</div><div className="l">Categories</div></div>
              <div className="stat"><div className="n" data-count="1592">0</div><div className="l">m · Sarangkot peak</div></div>
            </div>
          </Reveal>
        </div>
      </header>

      <section className="section">
        <div className="container">
          <Reveal><div className="section-head">
            <span className="eyebrow">★ Editor&apos;s picks</span>
            <h2>Iconic Pokhara</h2>
            <p>The places every traveller should see — and exactly how to get there.</p>
          </div></Reveal>
          <Stagger className="grid cards">
            {featured === null
              ? [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 340 }} />)
              : (featured.length ? featured : []).map((d) => (
                <StaggerItem key={d.id}><HoverLift><DestinationCard d={d} /></HoverLift></StaggerItem>
              ))}
          </Stagger>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--bg-soft)' }}>
        <div className="container">
          <Reveal><div className="section-head">
            <span className="eyebrow">Why Pokhara Tú</span>
            <h2>Built for travellers, not tourists</h2>
            <p>Everything you need to plan, navigate and remember your trip in one calm place.</p>
          </div></Reveal>
          <Stagger className="feature">
            <StaggerItem><div className="feature-card"><div className="ico">🗺️</div><h3>OpenStreetMap routes</h3><p>Turn-by-turn directions to every destination — no API keys, no paywalls.</p></div></StaggerItem>
            <StaggerItem><div className="feature-card"><div className="ico">⭐</div><h3>Honest ratings</h3><p>Rate each spot 1–5 and see the real community average update instantly.</p></div></StaggerItem>
            <StaggerItem><div className="feature-card"><div className="ico">💬</div><h3>Traveller reviews</h3><p>Read and write comments from people who&apos;ve actually been there.</p></div></StaggerItem>
            <StaggerItem><div className="feature-card"><div className="ico">🔐</div><h3>Your profile</h3><p>Keep a personal log of everywhere you&apos;ve rated and reviewed.</p></div></StaggerItem>
          </Stagger>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal><div className="section-head">
            <span className="eyebrow">Browse by vibe</span>
            <h2>Whatever you came for</h2>
          </div></Reveal>
          <Stagger className="grid cards">
            {CATEGORIES.map((x) => (
              <StaggerItem key={x.c}>
                <Link href={`/destinations?cat=${encodeURIComponent(x.c)}`} className="card">
                  <div className="card-body" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <div className="ico" style={{ fontSize: '1.8rem', margin: 0 }}>{x.e}</div>
                    <div><h3 style={{ margin: 0 }}>{x.c}</h3><p style={{ margin: 0, fontSize: '.85rem' }}>{x.t}</p></div>
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal><div className="cta-band">
            <Diya size={34} className="diya-inline" />
            <h2>Ready to wander?</h2>
            <p>Create a free account, save your favourite spots, and rate the places that moved you.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/register" className="btn btn-amber">Create free account</Link>
              <Link href="/map" className="btn btn-ghost">Just show me the map</Link>
            </div>
          </div></Reveal>
        </div>
      </section>
    </>
  );
}
