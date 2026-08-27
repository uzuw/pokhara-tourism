'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, toast, getToken, getStoredUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function makeIcon(L) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#ff7a45;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:14px">📍</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  });
}

function timeAgo(iso) {
  const d = new Date((iso || '').replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const days = Math.floor(h / 24); if (days < 30) return days + 'd ago';
  return days.toLocaleDateString();
}

export default function DestinationDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const [dest, setDest] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState(null);
  const [dist, setDist] = useState(null);
  const [myRating, setMyRating] = useState(0);
  const [hover, setHover] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = (await api('/api/destinations/' + slug)).destination;
      setDest(d); setMyRating(d.my_rating || 0);
    } catch { setNotFound(true); return; }
    try { setComments((await api('/api/destinations/' + slug + '/comments')).comments); } catch { setComments([]); }
    try { setDist((await api('/api/destinations/' + slug + '/ratings')).distribution); } catch {}
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!dest || !mapEl.current || mapRef.current) return;
    if (!LRef.current) {
      import('leaflet').then((L) => {
        LRef.current = L;
        const m = L.map(mapEl.current).setView([dest.lat, dest.lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
        L.marker([dest.lat, dest.lng], { icon: makeIcon(L) }).addTo(m).bindPopup(`<b>${dest.name}</b>`);
        mapRef.current = m;
        setTimeout(() => m.invalidateSize(), 200);
        const ro = new ResizeObserver(() => m.invalidateSize());
        ro.observe(mapEl.current);
        window.addEventListener('resize', () => m.invalidateSize());
      });
      return;
    }
    const m = LRef.current.map(mapEl.current).setView([dest.lat, dest.lng], 14);
    LRef.current.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    LRef.current.marker([dest.lat, dest.lng], { icon: makeIcon(LRef.current) }).addTo(m).bindPopup(`<b>${dest.name}</b>`);
    mapRef.current = m;
    setTimeout(() => m.invalidateSize(), 200);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(mapEl.current);
    window.addEventListener('resize', () => m.invalidateSize());
  }, [dest]);

  async function submitRating(score) {
    if (!getToken()) { toast('Log in to rate'); return; }
    try {
      const r = await api('/api/destinations/' + slug + '/ratings', { method: 'POST', body: { score } });
      setMyRating(score);
      toast('Thanks for rating! ⭐');
      const d = (await api('/api/destinations/' + slug)).destination;
      setDest(d);
      setDist((await api('/api/destinations/' + slug + '/ratings')).distribution);
    } catch (e) { toast(e.message); }
  }

  async function postComment(text) {
    try {
      const r = await api('/api/destinations/' + slug + '/comments', { method: 'POST', body: { text } });
      setComments((prev) => [r.comment, ...(prev || [])]);
      toast('Review posted 💬');
    } catch (e) { toast(e.message); }
  }

  async function delComment(id) {
    try {
      await api('/api/comments/' + id, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== id));
      toast('Review deleted');
    } catch (e) { toast(e.message); }
  }

  if (notFound) return <section className="section center"><h2>Destination not found</h2><Link className="btn btn-primary" href="/destinations">Back to list</Link></section>;
  if (!dest) return <section className="section center"><div className="spinner" style={{ borderColor: 'var(--teal-500)', borderTopColor: 'transparent' }} /></section>;

  const me = getStoredUser();
  const tags = (dest.tags || '').split(',').map((t) => t.trim()).filter(Boolean);

  return (
    <>
      <header className="detail-hero">
        <img src={dest.image} alt={dest.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div className="inner">
          <Link href="/destinations" style={{ color: '#bcd', fontSize: '.85rem' }}>← All destinations</Link>
          <h1>{dest.name}</h1>
          <div className="meta-row">
            <span className="info-chip">📍 {dest.lat.toFixed(4)}, {dest.lng.toFixed(4)}</span>
            <span className="info-chip">🎫 {dest.entry_fee || 'Free'}</span>
            <span className="info-chip">🕒 {dest.best_time || 'Any time'}</span>
            <span className="info-chip">⭐ {dest.avg_rating > 0 ? dest.avg_rating.toFixed(1) + ' (' + dest.rating_count + ')' : 'No ratings yet'}</span>
          </div>
        </div>
      </header>

      <section className="section">
        <div className="container detail-grid">
          <div>
            <h2 style={{ color: 'var(--lake-800)', marginTop: 0 }}>About {dest.name}</h2>
            <p style={{ color: 'var(--ink-soft)' }}>{dest.description}</p>
            <div className="tag-row" style={{ margin: '14px 0 24px' }}>{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>

            <h3 style={{ color: 'var(--lake-800)' }}>📍 How to get there</h3>
            <div id="detailMap" ref={mapEl}></div>
            <p className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>Open the full map to draw a route from any other spot: <Link href={`/map?slug=${dest.slug}`} style={{ color: 'var(--lake-600)', fontWeight: 600 }}>Plan your route →</Link></p>

            <h3 style={{ color: 'var(--lake-800)', marginTop: 30 }}>💬 Traveller reviews ({dest.comment_count})</h3>
            {me ? (
              <div className="rating-panel" style={{ marginBottom: 18 }}>
                <textarea id="cText" rows="3" placeholder="Share your experience…" style={{ width: '100%', padding: 12, borderRadius: 12, border: '1.5px solid var(--line)', font: 'inherit', resize: 'vertical' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={() => { const t = document.getElementById('cText').value.trim(); if (t.length < 2) return toast('Write a little more'); postComment(t); document.getElementById('cText').value = ''; }}>Post review</button>
                </div>
              </div>
            ) : (
              <div className="login-prompt" style={{ marginBottom: 18 }}><Link href="/login">Log in</Link> to leave a review.</div>
            )}
            {comments === null ? <p className="muted">Loading…</p> :
              comments.length ? comments.map((c) => (
                <div className="comment" key={c.id}>
                  <div className="comment-head">
                    <span className="avatar-sm">{c.username?.[0]?.toUpperCase()}</span>
                    <span className="name">{c.username}</span>
                    <span className="time">{timeAgo(c.created_at)}</span>
                    {me && me.username === c.username && <button className="del" onClick={() => delComment(c.id)}>delete</button>}
                  </div>
                  <div className="comment-body">{c.text}</div>
                </div>
              )) : <p className="muted">Be the first to review this spot.</p>}
          </div>

          <aside>
            <div className="rating-panel" style={{ marginBottom: 22 }}>
              <h3 style={{ marginTop: 0, color: 'var(--lake-800)' }}>Rate this spot</h3>
              <div className="rating-summary">
                <div>
                  <div className="big-score">{dest.avg_rating > 0 ? dest.avg_rating.toFixed(1) : '—'}</div>
                  <div className="muted" style={{ fontSize: '.8rem' }}>{dest.rating_count} rating{dest.rating_count === 1 ? '' : 's'}</div>
                </div>
                <div className="dist">
                  {[5, 4, 3, 2, 1].map((s) => {
                    const c = (dist && dist[s]) || 0;
                    const max = Math.max(1, ...(dist ? Object.values(dist) : [1]));
                    return <div className="dist-row" key={s}>{s}★ <div className="dist-bar"><span style={{ width: Math.round((c / max) * 100) + '%' }} /></div> {c}</div>;
                  })}
                </div>
              </div>
              <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div className="muted" style={{ fontSize: '.85rem', marginBottom: 6 }}>{me ? 'Your rating:' : <Link href="/login" style={{ color: 'var(--lake-600)' }}>Log in</Link> + ' to rate'}</div>
                <div className="rating-stars" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button key={i} className={(hover || myRating) >= i ? 'active' : ''}
                      onMouseEnter={() => me && setHover(i)}
                      onClick={() => submitRating(i)}>{'★'}</button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
