'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, getStoredUser, setStoredUser } from '@/lib/api';
import { useAuth, toast } from '@/lib/auth';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';

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

export default function ProfilePage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', bio: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!getToken()) { router.replace('/login?next=/profile'); return; }
    api('/api/users/me').then((r) => {
      setData(r);
      setEditForm({ username: r.user.username, bio: r.user.bio || '' });
    }).catch(() => toast('Could not load profile'));
  }, [router]);

  async function save() {
    setErr('');
    try {
      const r = await api('/api/users/me', { method: 'PATCH', body: editForm });
      setStoredUser(r.user); setUser(r.user); setData((d) => ({ ...d, user: r.user }));
      setEdit(false); toast('Profile saved ✨');
    } catch (e2) { setErr(e2.message); }
  }

  if (!data) return <section className="section center"><div className="spinner" style={{ borderColor: 'var(--teal-500)', borderTopColor: 'transparent' }} /></section>;

  const { user, myRatings, myComments, stats } = data;
  return (
    <section className="section" style={{ paddingTop: 46 }}>
      <div className="container">
        <div className="profile-head">
          <div className="avatar-lg">{user.username?.[0]?.toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: 'var(--lake-800)' }}>{user.username}</h2>
            <div className="muted">{user.email} · joined {new Date((user.created_at || '').replace(' ', 'T') + 'Z').toLocaleDateString()}</div>
            <div className="profile-stats">
              <div><div className="n">{stats.ratings_given}</div><div className="l">Ratings</div></div>
              <div><div className="n">{stats.comments_made}</div><div className="l">Reviews</div></div>
            </div>
          </div>
          <button className="btn btn-outline" onClick={() => setEdit((v) => !v)}>{edit ? 'Cancel' : 'Edit profile'}</button>
        </div>

        {edit && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 22, margin: '18px 0', boxShadow: 'var(--shadow-sm)' }}>
            {err && <div className="form-error" style={{ display: 'block' }}>{err}</div>}
            <div className="field"><label>Username</label><input value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} /></div>
            <div className="field"><label>Bio</label><textarea rows={3} value={editForm.bio} onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))} placeholder="Tell us about your travels…" /></div>
            <button className="btn btn-primary" onClick={save}>Save changes</button>
          </div>
        )}

        <Stagger className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24, alignItems: 'start' }}>
          <StaggerItem><div className="rating-panel">
            <h3 style={{ marginTop: 0, color: 'var(--lake-800)' }}>⭐ Your ratings</h3>
            {myRatings.length ? myRatings.map((r) => (
              <div key={r.slug} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <img src={r.image} style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.background = 'linear-gradient(120deg,#0e3a56,#14b8a6)'; e.currentTarget.removeAttribute('src'); }} alt="" />
                <div style={{ flex: 1 }}><a href={`/destination/${r.slug}`} style={{ fontWeight: 600, color: 'var(--lake-800)' }}>{r.name}</a><div style={{ color: '#ffb400', fontSize: '.95rem' }}>{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</div></div>
              </div>
            )) : <p className="muted">You haven&apos;t rated anything yet.</p>}
          </div></StaggerItem>
          <StaggerItem><div className="comments-panel">
            <h3 style={{ marginTop: 0, color: 'var(--lake-800)' }}>💬 Your reviews</h3>
            {myComments.length ? myComments.map((c) => (
              <div className="comment" key={c.id}>
                <div className="comment-head"><span className="name">{c.name}</span><span className="time">{timeAgo(c.created_at)}</span></div>
                <div className="comment-body">{c.text}</div>
              </div>
            )) : <p className="muted">No reviews yet.</p>}
          </div></StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}
